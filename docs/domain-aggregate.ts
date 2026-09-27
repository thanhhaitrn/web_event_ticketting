// Class hóa thực thể — EventTicketing (mô hình DDD Aggregate)
// Khớp với sơ đồ trong OOP_WEBTICKET.docx: Event là Aggregate Root,
// Show/Zone/SalePhase chỉ sửa được thông qua Event; các giá trị bọc
// thành Value Object bất biến (Money, TimeRange, Capacity, PriceBounds...).

// ─────────────────────────────────────────────────────────
// VALUE OBJECTS — bất biến, tự validate khi khởi tạo
// ─────────────────────────────────────────────────────────

export class Money {
  private constructor(private readonly amount: number) {} // VND

  static vnd(amount: number): Money {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Money: amount phải là số không âm");
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
  constructor(private readonly start: Date, private readonly end: Date) {
    if (end.getTime() <= start.getTime()) {
      throw new Error("TimeRange: end phải sau start");
    }
  }

  contains(t: Date): boolean {
    return t.getTime() >= this.start.getTime() && t.getTime() <= this.end.getTime();
  }

  overlaps(r: TimeRange): boolean {
    return this.start.getTime() < r.end.getTime() && r.start.getTime() < this.end.getTime();
  }

  // gộp nhiều TimeRange (VD các Show) thành 1 khoảng bao trùm toàn bộ
  span(ranges: TimeRange[]): TimeRange {
    if (ranges.length === 0) return this;
    const starts = ranges.map((r) => r.start.getTime());
    const ends = ranges.map((r) => r.end.getTime());
    return new TimeRange(new Date(Math.min(...starts)), new Date(Math.max(...ends)));
  }

  getStart(): Date { return this.start; }
  getEnd(): Date { return this.end; }
}

export class Capacity {
  constructor(private readonly value: number) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Capacity: phải là số nguyên >= 0");
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
      throw new Error("PriceBounds: yêu cầu floor <= base <= ceiling");
    }
    return new PriceBounds(floor, base, ceiling);
  }

  // mọi mức giá đề xuất đều bị ép về trong [floor, ceiling] — không bao giờ vượt biên
  clamp(p: Money): Money {
    if (p.getAmount() < this.floor.getAmount()) return this.floor;
    if (p.getAmount() > this.ceiling.getAmount()) return this.ceiling;
    return p;
  }
}

export class Venue {
  constructor(private readonly location: string, private readonly province?: Province) {}

  label(): string {
    return this.province ? `${this.location}, ${this.province.getName()}` : this.location;
  }
}

export class ImageRef {
  private constructor(private readonly url: string) {}

  static parse(url: string): ImageRef {
    if (!url) throw new Error("ImageRef: url rỗng");
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

  getName(): string {
    return this.name;
  }
}

export class Genre {
  constructor(
    private readonly slug: string,
    private readonly name: string,
    private readonly mbid: string,
    private readonly featured: boolean,
    private readonly sortOrder: number,
  ) {}
}

// ─────────────────────────────────────────────────────────
// THỰC THỂ TRONG AGGREGATE — chỉ được tạo/sửa qua Event, không new() trực tiếp từ bên ngoài
// ─────────────────────────────────────────────────────────

type ShowId = string;
type ZoneId = string;
type PhaseId = string;

export class Show {
  constructor(
    public readonly id: ShowId,
    private name: string,
    private time: TimeRange,
  ) {}

  isUpcoming(now: Date): boolean {
    return this.time.getStart().getTime() > now.getTime();
  }

  getTime(): TimeRange {
    return this.time;
  }
}

export class Zone {
  private quotas = new Map<ShowId, Capacity>();
  private prices = new Map<PhaseId, PriceBounds>();

  constructor(public readonly id: ZoneId, private name: string) {}

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

  setPrice(phase: PhaseId, b: PriceBounds): void {
    this.prices.set(phase, b);
  }

  priceFor(phase: PhaseId): PriceBounds | undefined {
    return this.prices.get(phase);
  }
}

export class SalePhase {
  constructor(
    public readonly id: PhaseId,
    private name: string,
    private time: TimeRange,
  ) {}

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

type EventId = string;
export type SaleStatus = "upcoming" | "on_sale" | "closed";

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

  // thời gian tổ chức thực tế = khoảng bao trùm toàn bộ các đêm diễn (Show)
  schedule(): TimeRange {
    return this.saleWindow.span(this.shows.map((s) => s.getTime()));
  }

  addShow(time: TimeRange): Show {
    const show = new Show(crypto.randomUUID(), `Đêm ${this.shows.length + 1}`, time);
    this.shows.push(show);
    return show;
  }

  removeShow(id: ShowId): void {
    if (this.shows.length <= 1) {
      throw new Error("Sự kiện cần ít nhất một đêm diễn");
    }
    this.shows = this.shows.filter((s) => s.id !== id);
  }

  addZone(name: string): Zone {
    const zone = new Zone(crypto.randomUUID(), name);
    this.zones.push(zone);
    return zone;
  }

  addSalePhase(name: string, time: TimeRange): SalePhase {
    const phase = new SalePhase(crypto.randomUUID(), name, time);
    this.phases.push(phase);
    return phase;
  }

  activePhase(now: Date): SalePhase | undefined {
    return this.phases.find((p) => p.isActive(now));
  }

  saleStatus(now: Date): SaleStatus {
    if (now.getTime() < this.saleWindow.getStart().getTime()) return "upcoming";
    if (now.getTime() > this.saleWindow.getEnd().getTime()) return "closed";
    return "on_sale";
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
