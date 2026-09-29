// Class hóa thực thể — EventTicketing (mô hình DDD Aggregate)
// Show/Zone/SalePhase chỉ sửa được thông qua Event; các giá trị bọc
// thành Value Object bất biến (Money, TimeRange, Capacity, PriceBounds...).
//
// Lớp này không biết gì về Prisma hay HTTP: API route bắt DomainError và trả 400,
// còn việc đọc/ghi database nằm ở lib/event-repository.ts.

/** vi phạm quy tắc nghiệp vụ; message viết sẵn để hiển thị cho người dùng */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

// cột Int của Prisma/SQLite là số nguyên 32-bit có dấu
const MAX_INT = 2147483647;
const isStoredInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_INT;

// ─────────────────────────────────────────────────────────
// VALUE OBJECTS — bất biến, tự validate khi khởi tạo
// ─────────────────────────────────────────────────────────

export class Money {
  private constructor(private readonly amount: number) {} // VND

  static isValidAmount(amount: unknown): amount is number {
    return isStoredInt(amount);
  }

  static vnd(amount: number): Money {
    if (!Money.isValidAmount(amount)) {
      throw new DomainError("Số tiền phải là số nguyên không âm.");
    }
    return new Money(amount);
  }

  getAmount(): number {
    return this.amount;
  }

  format(): string {
    return this.amount.toLocaleString("vi-VN") + " ₫";
  }
}

export class TimeRange {
  // readonly: đọc được nhưng không sửa được sau khi tạo
  constructor(readonly start: Date, readonly end: Date) {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new DomainError("Thời gian không hợp lệ.");
    }
    if (end.getTime() <= start.getTime()) {
      throw new DomainError("Thời gian kết thúc phải sau thời gian bắt đầu.");
    }
  }

  /** từ chuỗi ISO của request; null khi thiếu, sai định dạng hoặc kết thúc không sau bắt đầu */
  static tryParse(start: unknown, end: unknown): TimeRange | null {
    if (typeof start !== "string" || typeof end !== "string") return null;
    try {
      return new TimeRange(new Date(start), new Date(end));
    } catch {
      return null;
    }
  }

  // khoảng nửa mở [start, end): hai đợt liền nhau không cùng "đang mở bán" một lúc
  contains(t: Date): boolean {
    return t.getTime() >= this.start.getTime() && t.getTime() < this.end.getTime();
  }

  overlaps(r: TimeRange): boolean {
    return this.start.getTime() < r.end.getTime() && r.start.getTime() < this.end.getTime();
  }

  // gộp nhiều TimeRange (VD các Show) thành 1 khoảng bao trùm toàn bộ; null khi không có khoảng nào
  static span(ranges: TimeRange[]): TimeRange | null {
    if (ranges.length === 0) return null;
    const starts = ranges.map((r) => r.start.getTime());
    const ends = ranges.map((r) => r.end.getTime());
    return new TimeRange(new Date(Math.min(...starts)), new Date(Math.max(...ends)));
  }

  getStart(): Date { return this.start; }
  getEnd(): Date { return this.end; }
}

export class Capacity {
  constructor(private readonly value: number) {
    if (!isStoredInt(value)) {
      throw new DomainError("Số vé phải là số nguyên không âm.");
    }
  }

  getValue(): number {
    return this.value;
  }
}

export class PriceBounds {
  private constructor(
    private readonly floor: Money,
    private readonly base: Money,
    private readonly ceiling: Money,
  ) {}

  static of(floor: Money, base: Money, ceiling: Money): PriceBounds {
    if (floor.getAmount() > base.getAmount() || base.getAmount() > ceiling.getAmount()) {
      throw new DomainError("Giá cơ bản phải nằm trong khoảng giá sàn và giá trần.");
    }
    return new PriceBounds(floor, base, ceiling);
  }

  /** từ ba số VND (như trong request hoặc database) */
  static fromAmounts(floor: number, base: number, ceiling: number): PriceBounds {
    return PriceBounds.of(Money.vnd(floor), Money.vnd(base), Money.vnd(ceiling));
  }

  // mọi mức giá đề xuất đều bị ép về trong [floor, ceiling] — không bao giờ vượt biên
  clamp(p: Money): Money {
    if (p.getAmount() < this.floor.getAmount()) return this.floor;
    if (p.getAmount() > this.ceiling.getAmount()) return this.ceiling;
    return p;
  }

  getFloor(): Money { return this.floor; }
  getBase(): Money { return this.base; }
  getCeiling(): Money { return this.ceiling; }
}

export class Venue {
  constructor(private readonly location: string, private readonly province?: Province) {}

  label(): string {
    return this.province ? `${this.location}, ${this.province.getName()}` : this.location;
  }

  getLocation(): string {
    return this.location;
  }

  getProvince(): Province | undefined {
    return this.province;
  }
}

export class ImageRef {
  private constructor(private readonly url: string) {}

  static parse(url: string): ImageRef {
    if (!url) throw new DomainError("Ảnh không hợp lệ.");
    return new ImageRef(url);
  }

  getUrl(): string {
    return this.url;
  }
}

// ─────────────────────────────────────────────────────────
// THỰC THỂ NGOÀI AGGREGATE — tham chiếu tới, không thuộc sở hữu của Event
// ─────────────────────────────────────────────────────────

export class Province {
  constructor(
    private readonly code: number,
    private readonly name: string,
    private readonly fullName: string,
  ) {}

  getCode(): number { return this.code; }
  getName(): string { return this.name; }
  getFullName(): string { return this.fullName; }
}

export class Genre {
  constructor(
    private readonly slug: string,
    private readonly name: string,
    private readonly mbid: string,
    private readonly featured: boolean,
    private readonly sortOrder: number,
  ) {}

  getSlug(): string { return this.slug; }
  getName(): string { return this.name; }
  isFeatured(): boolean { return this.featured; }
}

// ─────────────────────────────────────────────────────────
// THỰC THỂ TRONG AGGREGATE — chỉ được tạo/sửa qua Event, không new() trực tiếp từ bên ngoài
// ─────────────────────────────────────────────────────────

export type ShowId = string;
export type ZoneId = string;
export type PhaseId = string;

export class Show {
  constructor(
    public readonly id: ShowId,
    private name: string,
    private time: TimeRange,
  ) {}

  isUpcoming(now: Date): boolean {
    return this.time.getStart().getTime() > now.getTime();
  }

  getName(): string { return this.name; }
  getTime(): TimeRange { return this.time; }

  rename(name: string): void {
    if (!name.trim()) throw new DomainError("Tên đêm diễn không được để trống.");
    this.name = name.trim();
  }

  reschedule(time: TimeRange): void {
    this.time = time;
  }
}

export class Zone {
  private quotas = new Map<ShowId, Capacity>();
  private prices = new Map<PhaseId, PriceBounds>();

  constructor(public readonly id: ZoneId, private name: string) {}

  getName(): string { return this.name; }

  rename(name: string): void {
    if (!name.trim()) throw new DomainError("Tên khu vực không được để trống.");
    this.name = name.trim();
  }

  setCapacity(show: ShowId, n: Capacity): void {
    this.quotas.set(show, n);
  }

  capacityFor(show: ShowId): Capacity {
    return this.quotas.get(show) ?? new Capacity(0);
  }

  totalCapacity(): Capacity {
    let total = 0;
    for (const c of this.quotas.values()) total += c.getValue();
    return new Capacity(total);
  }

  /** số vé theo từng đêm, để repository lưu lại */
  capacities(): ReadonlyMap<ShowId, Capacity> {
    return this.quotas;
  }

  /** khi một đêm bị xoá, số vé của đêm đó cũng không còn */
  dropQuota(show: ShowId): void {
    this.quotas.delete(show);
  }

  setPrice(phase: PhaseId, b: PriceBounds): void {
    this.prices.set(phase, b);
  }

  priceFor(phase: PhaseId): PriceBounds | undefined {
    return this.prices.get(phase);
  }

  /** giá theo từng đợt, để repository lưu lại */
  priceTable(): ReadonlyMap<PhaseId, PriceBounds> {
    return this.prices;
  }

  dropPrice(phase: PhaseId): void {
    this.prices.delete(phase);
  }
}

export class SalePhase {
  constructor(
    public readonly id: PhaseId,
    private name: string,
    private time: TimeRange,
  ) {}

  getName(): string { return this.name; }
  getTime(): TimeRange { return this.time; }

  isActive(now: Date): boolean {
    return this.time.contains(now);
  }

  isUpcoming(now: Date): boolean {
    return this.time.getStart().getTime() > now.getTime();
  }
}

// ─────────────────────────────────────────────────────────
// AGGREGATE ROOT — Event
// "chỉ sửa được qua Event": mọi thao tác thêm/xoá Show/Zone/SalePhase
// đều phải đi qua method của Event, không thao tác thẳng vào mảng con.
// ─────────────────────────────────────────────────────────

export type EventId = string;
export type SaleStatus = "upcoming" | "on_sale" | "closed" | "unannounced";

/** dữ liệu đã lưu, dùng để dựng lại Event với đúng các id có sẵn (xem Event.restore) */
export type EventSnapshot = {
  id: EventId;
  name: string;
  artist?: string;
  venue: Venue;
  genres: Genre[];
  saleWindow: TimeRange;
  image?: ImageRef;
  shows: { id: ShowId; name: string; time: TimeRange }[];
  phases: { id: PhaseId; name: string; time: TimeRange }[];
  zones: {
    id: ZoneId;
    name: string;
    quotas: { showId: ShowId; capacity: number }[];
    prices: { phaseId: PhaseId; floor: number; base: number; ceiling: number }[];
  }[];
};

export class Event {
  private shows: Show[] = [];
  private zones: Zone[] = [];
  private phases: SalePhase[] = [];
  private image?: ImageRef;

  constructor(
    public readonly id: EventId,
    private name: string,
    private venue: Venue,
    private genres: Genre[],
    private saleWindow: TimeRange,
    private artist?: string,
  ) {}

  /** dựng lại aggregate từ dữ liệu đã lưu, giữ nguyên id của từng đêm, khu vực và đợt */
  static restore(s: EventSnapshot): Event {
    const event = new Event(s.id, s.name, s.venue, s.genres, s.saleWindow, s.artist);
    event.image = s.image;
    event.shows = s.shows.map((x) => new Show(x.id, x.name, x.time));
    event.phases = s.phases.map((x) => new SalePhase(x.id, x.name, x.time));
    event.zones = s.zones.map((z) => {
      const zone = new Zone(z.id, z.name);
      for (const q of z.quotas) zone.setCapacity(q.showId, new Capacity(q.capacity));
      for (const p of z.prices) zone.setPrice(p.phaseId, PriceBounds.fromAmounts(p.floor, p.base, p.ceiling));
      return zone;
    });
    return event;
  }

  getName(): string { return this.name; }
  getArtist(): string | undefined { return this.artist; }
  getVenue(): Venue { return this.venue; }
  getGenres(): readonly Genre[] { return this.genres; }
  getImage(): ImageRef | undefined { return this.image; }
  getSaleWindow(): TimeRange { return this.saleWindow; }
  getShows(): readonly Show[] { return this.shows; }
  getZones(): readonly Zone[] { return this.zones; }
  getPhases(): readonly SalePhase[] { return this.phases; }

  show(id: ShowId): Show | undefined { return this.shows.find((s) => s.id === id); }
  zone(id: ZoneId): Zone | undefined { return this.zones.find((z) => z.id === id); }
  phase(id: PhaseId): SalePhase | undefined { return this.phases.find((p) => p.id === id); }

  // thời gian tổ chức thực tế = khoảng bao trùm toàn bộ các đêm diễn (Show)
  schedule(): TimeRange | null {
    return TimeRange.span(this.shows.map((s) => s.getTime()));
  }

  addShow(time: TimeRange, name?: string): Show {
    const show = new Show(crypto.randomUUID(), name?.trim() || `Đêm ${this.shows.length + 1}`, time);
    this.shows.push(show);
    return show;
  }

  removeShow(id: ShowId): void {
    if (!this.show(id)) {
      throw new DomainError("Không tìm thấy đêm diễn.");
    }
    if (this.shows.length <= 1) {
      throw new DomainError("Sự kiện cần ít nhất một đêm diễn.");
    }
    this.shows = this.shows.filter((s) => s.id !== id);
    // số vé của đêm này ở mọi khu vực cũng mất theo
    for (const zone of this.zones) zone.dropQuota(id);
  }

  addZone(name: string): Zone {
    if (!name.trim()) throw new DomainError("Tên khu vực không được để trống.");
    const zone = new Zone(crypto.randomUUID(), name.trim());
    this.zones.push(zone);
    return zone;
  }

  /** số vé chỉ được gán cho đêm thuộc chính sự kiện này */
  setCapacity(zoneId: ZoneId, showId: ShowId, capacity: Capacity): void {
    const zone = this.zone(zoneId);
    if (!zone) throw new DomainError("Không tìm thấy khu vực.");
    if (!this.show(showId)) throw new DomainError("Đêm diễn không thuộc sự kiện này.");
    zone.setCapacity(showId, capacity);
  }

  /** giá chỉ được đặt cho đợt thuộc chính sự kiện này */
  setPrice(zoneId: ZoneId, phaseId: PhaseId, bounds: PriceBounds): void {
    const zone = this.zone(zoneId);
    if (!zone) throw new DomainError("Không tìm thấy khu vực.");
    if (!this.phase(phaseId)) throw new DomainError("Khu vực và đợt mở bán phải thuộc cùng sự kiện.");
    zone.setPrice(phaseId, bounds);
  }

  addSalePhase(name: string, time: TimeRange): SalePhase {
    if (!name.trim()) throw new DomainError("Tên đợt mở bán không được để trống.");
    const phase = new SalePhase(crypto.randomUUID(), name.trim(), time);
    this.phases.push(phase);
    return phase;
  }

  removeSalePhase(id: PhaseId): void {
    if (!this.phase(id)) throw new DomainError("Không tìm thấy đợt mở bán.");
    this.phases = this.phases.filter((p) => p.id !== id);
    // giá của đợt này ở mọi khu vực cũng mất theo
    for (const zone of this.zones) zone.dropPrice(id);
  }

  activePhase(now: Date): SalePhase | undefined {
    return this.sortedPhases().find((p) => p.isActive(now));
  }

  // cùng quy tắc với lib/sales.ts: đợt đang mở, nếu không thì đợt sắp tới, nếu không thì đợt cuối
  saleStatus(now: Date): SaleStatus {
    if (this.phases.length === 0) return "unannounced";
    if (this.activePhase(now)) return "on_sale";
    if (this.phases.some((p) => p.isUpcoming(now))) return "upcoming";
    return "closed";
  }

  private sortedPhases(): SalePhase[] {
    return [...this.phases].sort(
      (a, b) => a.getTime().getStart().getTime() - b.getTime().getStart().getTime(),
    );
  }
}

// ─────────────────────────────────────────────────────────
// REPOSITORY / SERVICE / INTERFACE (bên phải sơ đồ)
// ─────────────────────────────────────────────────────────

export interface EventRepository {
  findById(id: EventId): Promise<Event | null>;
  findUpcoming(): Promise<Event[]>;
  save(event: Event): Promise<void>;
}

export interface BrowseQuery {
  keyword?: string;
  provinceCode?: number;
  genreSlug?: string;
}

export interface EventSearch {
  search(q: BrowseQuery): Promise<Event[]>;
}

export interface ImageStorage {
  save(file: File): Promise<ImageRef>;
}

export interface PricingPolicy {
  // luôn trả Money đã qua PriceBounds.clamp() — không bao giờ vượt sàn/trần
  quote(zone: Zone, phase: SalePhase, demand: number): Money;
}
