// Cầu nối giữa database (Prisma) và các class trong lib/domain.ts.
// Đọc: gom Event + Show + Zone + SalePhase + số vé + giá thành một aggregate Event.
// Ghi: so aggregate với database rồi thêm / sửa / xoá đúng các dòng con.
import { prisma } from "@/lib/prisma";
import {
  Artist,
  Event,
  Genre,
  ImageRef,
  Province,
  TimeRange,
  Venue,
  type EventId,
  type EventRepository,
} from "@/lib/domain";

const include = {
  province: true,
  genres: true,
  artists: true,
  shows: { orderBy: { startTime: "asc" as const } },
  phases: { orderBy: { startTime: "asc" as const } },
  zones: {
    orderBy: { createdAt: "asc" as const },
    include: { quotas: true, prices: true },
  },
};

type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.event.findUnique<{ where: { id: string }; include: typeof include }>>>
>;

function toDomain(row: Row): Event {
  const province = row.province
    ? new Province(row.province.code, row.province.name, row.province.fullName)
    : undefined;
  return Event.restore({
    id: row.id,
    name: row.name,
    artists: row.artists.map((a) => new Artist(a.id, a.name, a.slug)),
    venue: new Venue(row.location, province),
    genres: row.genres.map((g) => new Genre(g.slug, g.name, g.mbid, g.featured, g.sortOrder)),
    saleWindow: new TimeRange(row.saleStart, row.saleEnd),
    image: row.imageUrl ? ImageRef.parse(row.imageUrl) : undefined,
    seatMap: row.seatMapUrl ? ImageRef.parse(row.seatMapUrl) : undefined,
    shows: row.shows.map((s) => ({ id: s.id, name: s.name, time: new TimeRange(s.startTime, s.endTime) })),
    phases: row.phases.map((p) => ({ id: p.id, name: p.name, time: new TimeRange(p.startTime, p.endTime) })),
    zones: row.zones.map((z) => ({
      id: z.id,
      name: z.name,
      quotas: z.quotas.map((q) => ({ showId: q.showId, capacity: q.capacity })),
      prices: z.prices.map((p) => ({
        phaseId: p.phaseId,
        floor: p.floorPrice,
        base: p.basePrice,
        ceiling: p.ceilingPrice,
      })),
    })),
  });
}

// Trạng thái của aggregate tại lúc nạp. save() chỉ ghi phần khác đi so với trạng thái này,
// nên hai request cùng lúc sửa hai ô khác nhau (VD số vé của hai đêm) không xoá mất việc của nhau.
type State = {
  event: string;
  shows: Map<string, string>;
  phases: Map<string, string>;
  zones: Map<string, string>;
  quotas: Map<string, number>; // "zoneId|showId" -> số vé
  prices: Map<string, string>; // "zoneId|phaseId" -> "sàn/cơ bản/trần"
};

function stateOf(event: Event): State {
  const venue = event.getVenue();
  const range = (t: { start: Date; end: Date }) => `${t.start.toISOString()}|${t.end.toISOString()}`;
  const state: State = {
    event: JSON.stringify([
      event.getName(),
      event.getArtists().map((a) => a.getSlug()),
      venue.getLocation(),
      venue.getProvince()?.getCode() ?? null,
      event.getImage()?.getUrl() ?? null,
      event.getSeatMap()?.getUrl() ?? null,
      range(event.getSaleWindow()),
      event.getGenres().map((g) => g.getSlug()),
    ]),
    shows: new Map(event.getShows().map((x) => [x.id, `${x.getName()}|${range(x.getTime())}`])),
    phases: new Map(event.getPhases().map((x) => [x.id, `${x.getName()}|${range(x.getTime())}`])),
    zones: new Map(event.getZones().map((z) => [z.id, z.getName()])),
    quotas: new Map(),
    prices: new Map(),
  };
  for (const z of event.getZones()) {
    for (const [showId, c] of z.capacities()) state.quotas.set(`${z.id}|${showId}`, c.getValue());
    for (const [phaseId, b] of z.priceTable()) {
      state.prices.set(
        `${z.id}|${phaseId}`,
        `${b.getFloor().getAmount()}/${b.getBase().getAmount()}/${b.getCeiling().getAmount()}`,
      );
    }
  }
  return state;
}

/** khoá có ở `before` nhưng không còn ở `after`, và khoá mới hoặc đổi giá trị */
function diff<V>(before: Map<string, V>, after: Map<string, V>) {
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const changed = [...after.keys()].filter((k) => before.get(k) !== after.get(k));
  return { removed, changed };
}

const empty = (): State => ({
  event: "",
  shows: new Map(),
  phases: new Map(),
  zones: new Map(),
  quotas: new Map(),
  prices: new Map(),
});

export class PrismaEventRepository implements EventRepository {
  private loaded = new WeakMap<Event, State>();

  private track(event: Event): Event {
    this.loaded.set(event, stateOf(event));
    return event;
  }

  async findById(id: EventId): Promise<Event | null> {
    const row = await prisma.event.findUnique({ where: { id }, include });
    return row ? this.track(toDomain(row)) : null;
  }

  /** sự kiện còn ít nhất một đêm chưa kết thúc, sớm nhất trước */
  async findUpcoming(): Promise<Event[]> {
    const rows = await prisma.event.findMany({
      where: { shows: { some: { endTime: { gt: new Date() } } } },
      orderBy: { startTime: "asc" },
      include,
    });
    return rows.map((row) => this.track(toDomain(row)));
  }

  /** chỉ ghi những gì đã đổi kể từ lúc nạp; aggregate mới (chưa từng nạp) được ghi toàn bộ */
  async save(event: Event): Promise<void> {
    const before = this.loaded.get(event) ?? empty();
    const after = stateOf(event);
    const shows = diff(before.shows, after.shows);
    const phases = diff(before.phases, after.phases);
    const zones = diff(before.zones, after.zones);
    const quotas = diff(before.quotas, after.quotas);
    const prices = diff(before.prices, after.prices);
    const split = (key: string) => key.split("|") as [string, string];

    const isNew = !this.loaded.has(event);
    const venue = event.getVenue();
    const scalars = {
      name: event.getName(),
      location: venue.getLocation(),
      provinceCode: venue.getProvince()?.getCode() ?? null,
      imageUrl: event.getImage()?.getUrl() ?? null,
      seatMapUrl: event.getSeatMap()?.getUrl() ?? null,
      saleStart: event.getSaleWindow().start,
      saleEnd: event.getSaleWindow().end,
    };

    await prisma.$transaction(async (tx) => {
      // nghệ sĩ mới được tạo tại đây, nên một sự kiện lưu thất bại không để lại nghệ sĩ thừa
      if (isNew || before.event !== after.event) {
        for (const a of event.getArtists()) {
          await tx.artist.upsert({
            where: { slug: a.getSlug() },
            update: {},
            create: { id: a.id, slug: a.getSlug(), name: a.getName() },
          });
        }
      }

      // sự kiện mới: tạo dòng Event trước, các đêm / đợt / khu vực ghi tiếp bên dưới
      if (isNew) {
        const schedule = event.schedule();
        if (!schedule) throw new Error("Sự kiện mới phải có ít nhất một đêm diễn.");
        await tx.event.create({
          data: {
            id: event.id,
            ...scalars,
            startTime: schedule.start,
            endTime: schedule.end,
            genres: { connect: event.getGenres().map((g) => ({ slug: g.getSlug() })) },
            artists: { connect: event.getArtists().map((a) => ({ slug: a.getSlug() })) },
          },
        });
      }

      // số vé và giá gắn với đêm / đợt / khu vực bị xoá được database xoá theo (onDelete: Cascade)
      if (shows.removed.length) await tx.show.deleteMany({ where: { eventId: event.id, id: { in: shows.removed } } });
      if (phases.removed.length) await tx.salePhase.deleteMany({ where: { eventId: event.id, id: { in: phases.removed } } });
      if (zones.removed.length) await tx.zone.deleteMany({ where: { eventId: event.id, id: { in: zones.removed } } });

      for (const id of shows.changed) {
        const s = event.show(id)!;
        const data = { name: s.getName(), startTime: s.getTime().start, endTime: s.getTime().end };
        await tx.show.upsert({ where: { id }, update: data, create: { id, eventId: event.id, ...data } });
      }
      for (const id of phases.changed) {
        const p = event.phase(id)!;
        const data = { name: p.getName(), startTime: p.getTime().start, endTime: p.getTime().end };
        await tx.salePhase.upsert({ where: { id }, update: data, create: { id, eventId: event.id, ...data } });
      }
      for (const id of zones.changed) {
        const name = event.zone(id)!.getName();
        await tx.zone.upsert({ where: { id }, update: { name }, create: { id, eventId: event.id, name } });
      }

      for (const key of quotas.removed) {
        const [zoneId, showId] = split(key);
        await tx.zoneQuota.deleteMany({ where: { zoneId, showId } });
      }
      for (const key of quotas.changed) {
        const [zoneId, showId] = split(key);
        const capacity = after.quotas.get(key)!;
        await tx.zoneQuota.upsert({
          where: { zoneId_showId: { zoneId, showId } },
          update: { capacity },
          create: { zoneId, showId, capacity },
        });
      }
      for (const key of prices.removed) {
        const [zoneId, phaseId] = split(key);
        await tx.zonePrice.deleteMany({ where: { zoneId, phaseId } });
      }
      for (const key of prices.changed) {
        const [zoneId, phaseId] = split(key);
        const b = event.zone(zoneId)!.priceFor(phaseId)!;
        const amounts = {
          floorPrice: b.getFloor().getAmount(),
          basePrice: b.getBase().getAmount(),
          ceilingPrice: b.getCeiling().getAmount(),
        };
        await tx.zonePrice.upsert({
          where: { zoneId_phaseId: { zoneId, phaseId } },
          update: amounts,
          create: { zoneId, phaseId, ...amounts },
        });
      }

      if (!isNew && before.event !== after.event) {
        await tx.event.update({
          where: { id: event.id },
          data: {
            ...scalars,
            genres: { set: event.getGenres().map((g) => ({ slug: g.getSlug() })) },
            artists: { set: event.getArtists().map((a) => ({ slug: a.getSlug() })) },
          },
        });
      }
      // thời gian tổ chức luôn bao trùm các đêm diễn; tính lại từ database để gồm cả đêm do request khác thêm
      if (shows.removed.length || shows.changed.length) {
        const span = await tx.show.aggregate({
          where: { eventId: event.id },
          _min: { startTime: true },
          _max: { endTime: true },
        });
        if (span._min.startTime && span._max.endTime) {
          await tx.event.update({
            where: { id: event.id },
            data: { startTime: span._min.startTime, endTime: span._max.endTime },
          });
        }
      }
    });

    this.loaded.set(event, after);
  }

  /** xoá sự kiện; đêm, khu vực, đợt, số vé và giá đi theo (onDelete: Cascade) */
  async delete(event: Event): Promise<void> {
    await prisma.event.delete({ where: { id: event.id } });
    this.loaded.delete(event);
  }

  /** còn sự kiện nào khác dùng ảnh này không (để biết có nên xoá file ảnh) */
  async isImageUsed(url: string): Promise<boolean> {
    return (await prisma.event.count({ where: { OR: [{ imageUrl: url }, { seatMapUrl: url }] } })) > 0;
  }
}

// ─────────────────────────────────────────────────────────
// dữ liệu tham chiếu: chỉ đọc, dùng để dựng Venue và danh sách Genre
// ─────────────────────────────────────────────────────────

/**
 * Tên gửi lên → các Artist: tên đã có thì dùng nghệ sĩ đó, tên mới thì tạo mới khi lưu.
 * "soobin" và "SOOBIN" là một người. null khi đầu vào không phải danh sách tên.
 */
export async function resolveArtists(names: unknown): Promise<Artist[] | null> {
  if (!Array.isArray(names) || names.length > 100 || !names.every((n) => typeof n === "string")) {
    return null;
  }
  const bySlug = new Map<string, Artist>();
  for (const name of names as string[]) {
    const artist = Artist.fromName(name);
    if (!bySlug.has(artist.getSlug())) bySlug.set(artist.getSlug(), artist);
  }
  const existing = await prisma.artist.findMany({ where: { slug: { in: [...bySlug.keys()] } } });
  for (const a of existing) bySlug.set(a.slug, new Artist(a.id, a.name, a.slug));
  return [...bySlug.values()];
}

export async function findProvince(code: unknown): Promise<Province | null> {
  if (typeof code !== "number" || !Number.isInteger(code)) return null;
  const row = await prisma.province.findUnique({ where: { code } });
  return row ? new Province(row.code, row.name, row.fullName) : null;
}

/** null khi đầu vào không phải danh sách slug, hoặc có slug không tồn tại */
export async function findGenres(slugs: unknown): Promise<Genre[] | null> {
  if (!Array.isArray(slugs) || !slugs.every((s) => typeof s === "string")) return null;
  const unique = [...new Set(slugs as string[])];
  if (unique.length === 0) return [];
  const rows = await prisma.genre.findMany({ where: { slug: { in: unique } } });
  if (rows.length !== unique.length) return null;
  return rows.map((g) => new Genre(g.slug, g.name, g.mbid, g.featured, g.sortOrder));
}

export const eventRepository = new PrismaEventRepository();
