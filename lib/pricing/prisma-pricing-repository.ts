import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  PriceChangeRecord,
  PricingRepository,
  SeatCounts,
  ShowContext,
  ZoneInfo,
} from "./pricing-service";

export class PrismaPricingRepository implements PricingRepository {
  constructor(private readonly db: PrismaClient) {}

  async loadShowContext(showId: string): Promise<ShowContext | null> {
    const show = await this.db.show.findUnique({
      where: { id: showId },
      include: {
        event: {
          include: {
            phases: { orderBy: { startTime: "asc" } },
            zones: {
              include: {
                quotas: { where: { showId } },
                prices: true,
              },
            },
          },
        },
      },
    });
    if (!show) return null;

    const zones: ZoneInfo[] = show.event.zones.map((z) => ({
      zoneId: z.id,
      capacity: z.quotas[0]?.capacity ?? 0,
      prices: Object.fromEntries(
        z.prices.map((p) => [
          p.phaseId,
          {
            bounds: { floor: p.floorPrice, base: p.basePrice, ceiling: p.ceilingPrice },
            dynamicEnabled: p.dynamicEnabled,
          },
        ]),
      ),
    }));

    return {
      showId,
      showStart: show.startTime,
      phases: show.event.phases.map((p) => ({ id: p.id, start: p.startTime, end: p.endTime })),
      zones,
    };
  }

  async countSeats(showId: string, now: Date): Promise<Map<string, SeatCounts>> {
    const [sold, held] = await Promise.all([
      this.db.seatReservation.groupBy({
        by: ["zoneId"],
        where: { showId, status: "SOLD" },
        _count: { _all: true },
      }),
      this.db.seatReservation.groupBy({
        by: ["zoneId"],
        where: { showId, status: "HELD", expiresAt: { gt: now } },
        _count: { _all: true },
      }),
    ]);
    const out = new Map<string, SeatCounts>();
    for (const r of sold) out.set(r.zoneId, { sold: r._count._all, held: 0 });
    for (const r of held) {
      const c = out.get(r.zoneId) ?? { sold: 0, held: 0 };
      c.held = r._count._all;
      out.set(r.zoneId, c);
    }
    return out;
  }

  async priceAt(zoneId: string, showId: string, phaseId: string, at: Date) {
    const row = await this.db.priceChange.findFirst({
      where: { zoneId, showId, phaseId, createdAt: { lte: at } },
      orderBy: [{ createdAt: "desc" }, { cycle: "desc" }],
      select: { newPrice: true },
    });
    return row?.newPrice ?? null;
  }

  async insertPriceChange(rec: PriceChangeRecord) {
    try {
      await this.db.priceChange.create({ data: rec });
      return true;
    } catch (e) {
      // P2002 = vi phạm khoá duy nhất (zoneId, showId, phaseId, cycle):
      // một recompute khác đã ghi cho chu kỳ này → bỏ qua.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  }

  async listShowsWithActivePhase(now: Date) {
    const shows = await this.db.show.findMany({
      where: {
        endTime: { gt: now },
        event: { phases: { some: { startTime: { lte: now }, endTime: { gt: now } } } },
      },
      select: { id: true },
    });
    return shows.map((s) => s.id);
  }

  /** Lịch sử giá cho BTC (S2-08). */
  async history(zoneId: string, showId: string, phaseId?: string) {
    return this.db.priceChange.findMany({
      where: { zoneId, showId, ...(phaseId ? { phaseId } : {}) },
      orderBy: { createdAt: "asc" },
    });
  }
}
