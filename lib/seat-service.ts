// Giữ ghế, nhả ghế và bán ghế. Quy tắc quan trọng nhất không nằm ở đây mà ở database:
// unique (showId, zoneId, seatNumber) khiến hai giao dịch không thể cùng có một ghế.
import { prisma } from "@/lib/prisma";
import { Capacity, DomainError, SeatSelection } from "@/lib/domain";
import { saleSummary } from "@/lib/sales";
import { SEATS_PER_ROW, seatLabel } from "@/lib/seat-layout";

const HELD = "HELD";
const SOLD = "SOLD";
const PAID = "PAID";
const EXPIRED = "EXPIRED";
const CANCELLED = "CANCELLED";

/** 5 phút; SEAT_HOLD_SECONDS chỉ để kiểm thử việc hết hạn mà không phải chờ */
export const holdSeconds = () => Number(process.env.SEAT_HOLD_SECONDS) || 300;

// transactions queue behind one SQLite connection, so give them room under a burst
const TX = { maxWait: 20_000, timeout: 20_000 };

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** a reservation that still blocks its seat at this moment */
const blocking = (now: Date) => ({
  OR: [{ status: SOLD }, { status: HELD, expiresAt: { gt: now } }],
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** turns holds past their time back into free seats */
async function releaseExpired(tx: Tx, now: Date) {
  await tx.order.updateMany({
    where: { status: HELD, expiresAt: { lte: now } },
    data: { status: EXPIRED, activeKey: null },
  });
  await tx.seatReservation.deleteMany({
    where: { status: HELD, expiresAt: { lte: now } },
  });
}

export type SeatMapStatus = {
  capacity: number;
  sold: number[];
  held: number[];
  mine: number[];
  counts: { sold: number; held: number; available: number };
};

export type OrderView = {
  id: string;
  status: string;
  showId: string;
  total: number;
  expiresAt: string;
  secondsLeft: number;
  seats: { zoneId: string; zoneName: string; seat: number; label: string; price: number }[];
};

export class SeatService {
  private lastSweep = 0;

  /**
   * Expired holds already read as free, so this only tidies rows; it runs at most
   * every few seconds however many people are watching the map.
   */
  private sweepSoon(now: Date) {
    if (now.getTime() - this.lastSweep < 5_000) return;
    this.lastSweep = now.getTime();
    prisma
      .$transaction((tx) => releaseExpired(tx, now), TX)
      .catch((e) => console.error("seat sweep failed", e));
  }

  /** trạng thái ghế trong khoảng [from, to] của một khu vực, cho sơ đồ ghế */
  async status(
    input: { showId: string; zoneId: string; buyerId?: string; from: number; to: number },
    now = new Date(),
  ): Promise<SeatMapStatus> {
    const { showId, zoneId, buyerId, from, to } = input;
    const quota = await prisma.zoneQuota.findUnique({
      where: { zoneId_showId: { zoneId, showId } },
    });
    if (!quota) throw new DomainError("Khu vực không bán vé trong đêm này.", 404);
    this.sweepSoon(now);

    const [rows, grouped] = await Promise.all([
      prisma.seatReservation.findMany({
        where: { showId, zoneId, seatNumber: { gte: from, lte: to }, ...blocking(now) },
        select: { seatNumber: true, status: true, order: { select: { buyerId: true } } },
      }),
      prisma.seatReservation.groupBy({
        by: ["status"],
        where: { showId, zoneId, ...blocking(now) },
        _count: true,
      }),
    ]);

    const result: SeatMapStatus = {
      capacity: quota.capacity,
      sold: [],
      held: [],
      mine: [],
      counts: { sold: 0, held: 0, available: 0 },
    };
    for (const r of rows) {
      if (r.status === SOLD) result.sold.push(r.seatNumber);
      else if (buyerId && r.order.buyerId === buyerId) result.mine.push(r.seatNumber);
      else result.held.push(r.seatNumber);
    }
    for (const g of grouped) {
      if (g.status === SOLD) result.counts.sold = g._count;
      else result.counts.held = g._count;
    }
    result.counts.available = Math.max(0, quota.capacity - result.counts.sold - result.counts.held);
    return result;
  }

  /** số ghế còn trống theo khu vực và số ghế đã lấy theo từng khối, cho danh sách vé và sơ đồ sân */
  async availability(
    showId: string,
    now = new Date(),
  ): Promise<{ zones: Record<string, number>; taken: Record<string, number> }> {
    const [quotas, rows] = await Promise.all([
      prisma.zoneQuota.findMany({ where: { showId }, select: { zoneId: true, capacity: true } }),
      prisma.$queryRaw<{ zoneId: string; seat_row: number | bigint; n: number | bigint }[]>`
        SELECT "zoneId", CAST(("seatNumber" - 1) / ${SEATS_PER_ROW} AS INTEGER) AS seat_row, COUNT(*) AS n
        FROM "SeatReservation"
        WHERE "showId" = ${showId} AND ("status" = ${SOLD} OR ("status" = ${HELD} AND "expiresAt" > ${now}))
        GROUP BY "zoneId", seat_row`,
    ]);
    this.sweepSoon(now);

    const taken: Record<string, number> = {};
    const perZone = new Map<string, number>();
    for (const r of rows) {
      const n = Number(r.n);
      taken[`${r.zoneId}:${Number(r.seat_row)}`] = n;
      perZone.set(r.zoneId, (perZone.get(r.zoneId) ?? 0) + n);
    }
    return {
      taken,
      zones: Object.fromEntries(
        quotas.map((q) => [q.zoneId, Math.max(0, q.capacity - (perZone.get(q.zoneId) ?? 0))]),
      ),
    };
  }

  /** giữ tất cả các ghế đã chọn trong 5 phút, hoặc không giữ ghế nào */
  async hold(
    input: { buyerId: string; showId: string; zoneId: string; seats: unknown },
    now = new Date(),
  ): Promise<OrderView> {
    const { buyerId, showId, zoneId } = input;
    const selection = new SeatSelection(input.seats);

    const show = await prisma.show.findUnique({
      where: { id: showId },
      include: { event: { include: { phases: true } } },
    });
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      include: { quotas: { where: { showId } }, prices: true },
    });
    if (!show || !zone || zone.eventId !== show.eventId || !zone.quotas[0]) {
      throw new DomainError("Khu vực không bán vé trong đêm này.", 404);
    }
    selection.assertWithin(new Capacity(zone.quotas[0].capacity));
    if (show.endTime <= now) throw new DomainError("Đêm diễn này đã kết thúc.");

    const sale = saleSummary(show.event.phases, now);
    const price = sale.isSelling ? zone.prices.find((p) => p.phaseId === sale.phase.id) : undefined;
    if (!price) throw new DomainError("Khu vực này hiện chưa mở bán.");

    const seatNumbers = [...selection.seats];
    const orderId = await this.createHold({ buyerId, showId, zoneId, seatNumbers, price: price.basePrice }, now);
    return this.view(orderId, now);
  }

  private async createHold(
    h: { buyerId: string; showId: string; zoneId: string; seatNumbers: number[]; price: number },
    now: Date,
  ): Promise<string> {
    const expiresAt = new Date(now.getTime() + holdSeconds() * 1000);
    try {
      return await prisma.$transaction(async (tx) => {
        await releaseExpired(tx, now);
        const order = await tx.order.create({
          data: {
            buyerId: h.buyerId,
            showId: h.showId,
            status: HELD,
            activeKey: `${h.buyerId}:${h.showId}`,
            seatCount: h.seatNumbers.length,
            totalAmount: h.price * h.seatNumbers.length,
            expiresAt,
          },
        });
        // one statement inside a transaction: any seat already taken rolls back the whole hold
        await tx.seatReservation.createMany({
          data: h.seatNumbers.map((seatNumber) => ({
            showId: h.showId,
            zoneId: h.zoneId,
            seatNumber,
            orderId: order.id,
            status: HELD,
            price: h.price,
            expiresAt,
          })),
        });
        return order.id;
      }, TX);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // lost a race: work out whether it was this buyer's other hold or someone else's seat
      const own = await prisma.order.findFirst({
        where: { activeKey: `${h.buyerId}:${h.showId}`, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (own) {
        throw new DomainError("Bạn đang giữ ghế cho đêm này. Hãy thanh toán hoặc huỷ trước khi chọn lại.", 409, {
          orderId: own.id,
        });
      }
      const taken = await prisma.seatReservation.findMany({
        where: {
          showId: h.showId,
          zoneId: h.zoneId,
          seatNumber: { in: h.seatNumbers },
          ...blocking(now),
        },
        select: { seatNumber: true },
      });
      throw new DomainError("Có ghế vừa được người khác chọn. Vui lòng chọn ghế khác.", 409, {
        taken: taken.map((t) => t.seatNumber),
      });
    }
  }

  /**
   * Thanh toán: chỉ thành công khi lần giữ còn hạn, kiểm tra ngay trong câu lệnh ghi.
   * Trả tiền chưa được kết nối cổng thật; đây là bước "giao dịch thành công".
   */
  async pay(input: { buyerId: string; orderId: string }, now = new Date()): Promise<OrderView> {
    const { buyerId, orderId } = input;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: HELD, expiresAt: { gt: now } },
        data: { status: PAID, paidAt: now, activeKey: null },
      });
      if (claimed.count === 0) return;
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const sold = await tx.seatReservation.updateMany({
        where: { orderId, status: HELD },
        data: { status: SOLD, expiresAt: null },
      });
      // every seat must still be held by this order, otherwise nothing is sold
      if (sold.count !== order.seatCount) {
        throw new DomainError("Lần giữ ghế đã hết hạn.", 410);
      }
    }, TX);

    const order = await prisma.order.findFirst({ where: { id: orderId, buyerId } });
    if (!order) throw new DomainError("Không tìm thấy đơn hàng.", 404);
    // paying twice (double click, retry) returns the same paid order, not a second sale
    if (order.status !== PAID) {
      throw new DomainError("Lần giữ ghế đã hết hạn, ghế đã được nhả. Vui lòng chọn lại.", 410);
    }
    return this.view(orderId, now);
  }

  /** người mua tự huỷ: ghế trống lại ngay */
  async cancel(input: { buyerId: string; orderId: string }): Promise<void> {
    const { buyerId, orderId } = input;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: HELD },
        data: { status: CANCELLED, activeKey: null },
      });
      if (claimed.count > 0) {
        await tx.seatReservation.deleteMany({ where: { orderId, status: HELD } });
      }
    }, TX);
  }

  /** lần giữ còn hạn của người này cho một đêm, nếu có */
  async currentHold(input: { buyerId: string; showId: string }, now = new Date()): Promise<OrderView | null> {
    const order = await prisma.order.findFirst({
      where: { buyerId: input.buyerId, showId: input.showId, status: HELD, expiresAt: { gt: now } },
      select: { id: true },
    });
    return order ? this.view(order.id, now) : null;
  }

  private async view(orderId: string, now: Date): Promise<OrderView> {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        seats: { orderBy: { seatNumber: "asc" }, include: { zone: { select: { name: true } } } },
      },
    });
    return {
      id: order.id,
      status: order.status,
      showId: order.showId,
      total: order.totalAmount,
      expiresAt: order.expiresAt.toISOString(),
      secondsLeft: Math.max(0, Math.ceil((order.expiresAt.getTime() - now.getTime()) / 1000)),
      seats: order.seats.map((s) => ({
        zoneId: s.zoneId,
        zoneName: s.zone.name,
        seat: s.seatNumber,
        label: seatLabel(s.seatNumber),
        price: s.price,
      })),
    };
  }

  // ───── cho ban tổ chức: không được xoá hay thu nhỏ phần đã có người giữ/mua ─────

  /** số vé đang giữ hoặc đã bán; lọc theo đêm, khu vực hoặc sự kiện */
  async countInUse(
    where: { showId?: string; zoneId?: string; eventId?: string },
    now = new Date(),
  ): Promise<number> {
    return prisma.seatReservation.count({
      where: {
        ...(where.showId ? { showId: where.showId } : {}),
        ...(where.zoneId ? { zoneId: where.zoneId } : {}),
        ...(where.eventId ? { show: { eventId: where.eventId } } : {}),
        ...blocking(now),
      },
    });
  }

  /** số ghế cao nhất đang giữ hoặc đã bán trong một khu vực của một đêm */
  async highestSeatInUse(showId: string, zoneId: string, now = new Date()): Promise<number> {
    const top = await prisma.seatReservation.aggregate({
      where: { showId, zoneId, ...blocking(now) },
      _max: { seatNumber: true },
    });
    return top._max.seatNumber ?? 0;
  }
}

export const seatService = new SeatService();
