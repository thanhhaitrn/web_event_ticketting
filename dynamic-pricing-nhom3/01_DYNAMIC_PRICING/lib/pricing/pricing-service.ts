/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Hồ sơ PTTK mục 9.5, UC-07, SD-05 (Hình 14)
 *
 * PricingService điều phối:
 *   - recompute(showId, now): mỗi 15 phút, với mỗi khu vực bật dynamicEnabled trong
 *     đợt đang mở → DemandSnapshot → policy.quote → ghi PriceChange nếu giá đổi.
 *   - currentPrice(showId, zoneId, now): giá hiện hành = PriceChange mới nhất của
 *     (khu vực, đêm, đợt) hoặc basePrice. SeatService.hold() dùng giá này (S2-07).
 *
 * Service không phụ thuộc Prisma: truy cập dữ liệu qua PricingRepository
 * (bản Prisma ở prisma-pricing-repository.ts, bản in-memory dùng cho test).
 */
import { RuleBasedPricingPolicy } from "./rule-based-pricing-policy";
import { DEFAULT_PRICING_RULES, cumulativeExpected, phaseProgress } from "./rules";
import type { DemandSnapshot, Money, PriceBounds, PricingDecision, PricingPolicy, PricingRules } from "./types";

const HOUR = 3_600_000;

// ---------- Dữ liệu đọc từ CSDL ----------

export interface PhaseInfo {
  id: string;
  start: Date;
  end: Date;
}

export interface ZonePriceInfo {
  bounds: PriceBounds;
  dynamicEnabled: boolean;
}

export interface ZoneInfo {
  zoneId: string;
  /** ZoneQuota.capacity của đêm này (0 hoặc không có dòng = không bán). */
  capacity: number;
  /** ZonePrice theo phaseId. */
  prices: Record<string, ZonePriceInfo>;
}

export interface ShowContext {
  showId: string;
  showStart: Date;
  /** Mọi SalePhase của sự kiện, sắp theo thời gian bắt đầu. */
  phases: PhaseInfo[];
  zones: ZoneInfo[];
}

export interface SeatCounts {
  sold: number;
  held: number;
}

export interface PriceChangeRecord {
  zoneId: string;
  showId: string;
  phaseId: string;
  /** Số thứ tự chu kỳ 15 phút: floor(now / 15 phút). Khoá duy nhất cùng zone/show/phase. */
  cycle: number;
  oldPrice: Money;
  newPrice: Money;
  occupancy: number;
  expected: number;
  rule: string;
  createdAt: Date;
}

export interface PricingRepository {
  loadShowContext(showId: string): Promise<ShowContext | null>;
  /** Số ghế SOLD và HELD còn hạn theo khu vực. */
  countSeats(showId: string, now: Date): Promise<Map<string, SeatCounts>>;
  /** Giá của PriceChange mới nhất (createdAt ≤ at) cho (zone, show, phase), null nếu chưa có. */
  priceAt(zoneId: string, showId: string, phaseId: string, at: Date): Promise<Money | null>;
  /** Ghi PriceChange; trả false nếu trùng khoá (zone, show, phase, cycle) — tức đã có lần đổi trong chu kỳ này. */
  insertPriceChange(rec: PriceChangeRecord): Promise<boolean>;
  /** Các show có đợt đang mở tại `now` (cho cron recompute toàn bộ). */
  listShowsWithActivePhase(now: Date): Promise<string[]>;
}

/**
 * Hook gọi cho MỌI khu vực có C > 0 trong đợt đang mở ở mỗi chu kỳ (kể cả khi
 * không bật định giá động). Phần 02 (cải tiến) dùng hook này để ghi DemandLog.
 */
export type SnapshotHook = (e: {
  showId: string;
  zoneId: string;
  phaseId: string;
  at: Date;
  snapshot: DemandSnapshot;
  price: Money;
  decision: PricingDecision | null;
}) => Promise<void> | void;

// ---------- Service ----------

export interface PricingServiceOptions {
  rules?: PricingRules;
  policy?: PricingPolicy;
  onSnapshot?: SnapshotHook;
  /**
   * Phương án dự phòng không cần cron (mục 9.5): currentPrice() tự gọi recompute()
   * nếu lần tính gần nhất của show đã quá 15 phút. Mốc thời gian lưu trong bộ nhớ tiến trình.
   */
  lazyRecompute?: boolean;
}

export class PricingService {
  readonly rules: PricingRules;
  private readonly policy: PricingPolicy;
  private readonly onSnapshot?: SnapshotHook;
  private readonly lazy: boolean;
  private readonly lastRun = new Map<string, number>();

  constructor(private readonly repo: PricingRepository, opts: PricingServiceOptions = {}) {
    this.rules = opts.rules ?? DEFAULT_PRICING_RULES;
    this.policy = opts.policy ?? new RuleBasedPricingPolicy(this.rules);
    this.onSnapshot = opts.onSnapshot;
    this.lazy = opts.lazyRecompute ?? false;
  }

  cycleOf(now: Date): number {
    return Math.floor(now.getTime() / (this.rules.recomputeIntervalMinutes * 60_000));
  }

  static activePhaseIndex(phases: PhaseInfo[], now: Date): number {
    const t = now.getTime();
    return phases.findIndex((p) => p.start.getTime() <= t && t < p.end.getTime());
  }

  /** Giá hiện hành của khu vực; null nếu không có đợt đang mở hoặc khu vực không có giá. */
  async currentPrice(showId: string, zoneId: string, now: Date = new Date()): Promise<Money | null> {
    if (this.lazy) {
      const last = this.lastRun.get(showId) ?? 0;
      if (now.getTime() - last >= this.rules.recomputeIntervalMinutes * 60_000) {
        await this.recompute(showId, now);
      }
    }
    const ctx = await this.repo.loadShowContext(showId);
    if (!ctx) return null;
    const idx = PricingService.activePhaseIndex(ctx.phases, now);
    if (idx < 0) return null;
    const phase = ctx.phases[idx];
    const zone = ctx.zones.find((z) => z.zoneId === zoneId);
    const zp = zone?.prices[phase.id];
    if (!zp) return null;
    if (!zp.dynamicEnabled) return zp.bounds.base;
    // Mỗi đợt bắt đầu ở giá cơ bản của đợt đó (mục 9.2.4): chỉ đọc PriceChange của đợt hiện tại.
    return (await this.repo.priceAt(zoneId, showId, phase.id, now)) ?? zp.bounds.base;
  }

  /** Tính lại giá cho mọi khu vực của một đêm. Trả về các PriceChange đã ghi. */
  async recompute(showId: string, now: Date = new Date()): Promise<PriceChangeRecord[]> {
    this.lastRun.set(showId, now.getTime());
    const ctx = await this.repo.loadShowContext(showId);
    if (!ctx) return [];
    const idx = PricingService.activePhaseIndex(ctx.phases, now);
    if (idx < 0) return []; // ngoài thời gian đợt → bỏ qua
    const phase = ctx.phases[idx];
    const K = cumulativeExpected(ctx.phases, this.rules.k);
    const counts = await this.repo.countSeats(showId, now);
    const p = phaseProgress(phase, now);
    const hoursToShow = (ctx.showStart.getTime() - now.getTime()) / HOUR;
    const cycle = this.cycleOf(now);
    const written: PriceChangeRecord[] = [];

    for (const zone of ctx.zones) {
      const zp = zone.prices[phase.id];
      if (!zp || zone.capacity <= 0) continue; // C = 0 → bỏ qua
      const c = counts.get(zone.zoneId) ?? { sold: 0, held: 0 };
      const base = zp.bounds.base;
      const P0 = zp.dynamicEnabled
        ? ((await this.repo.priceAt(zone.zoneId, showId, phase.id, now)) ?? base)
        : base;
      const P24 = zp.dynamicEnabled
        ? ((await this.repo.priceAt(zone.zoneId, showId, phase.id, new Date(now.getTime() - 24 * HOUR))) ?? base)
        : base;

      const snapshot: DemandSnapshot = {
        capacity: zone.capacity,
        sold: c.sold,
        held: c.held,
        phaseProgress: p,
        hoursToShow,
        expectedPrev: K[idx],
        expectedEnd: K[idx + 1],
        currentPrice: P0,
        price24hAgo: P24,
      };

      let decision: PricingDecision | null = null;
      if (zp.dynamicEnabled) {
        decision = this.policy.quote(zp.bounds, snapshot);
        if (decision.changed) {
          const rec: PriceChangeRecord = {
            zoneId: zone.zoneId,
            showId,
            phaseId: phase.id,
            cycle,
            oldPrice: P0,
            newPrice: decision.newPrice,
            occupancy: decision.occupancy,
            expected: decision.expected,
            rule: decision.rule,
            createdAt: now,
          };
          // Khoá duy nhất (zone, show, phase, cycle): hai lần recompute cùng chu kỳ
          // chỉ ghi được một dòng → bước 10% không bị cộng dồn.
          if (await this.repo.insertPriceChange(rec)) written.push(rec);
        }
      }

      if (this.onSnapshot) {
        await this.onSnapshot({
          showId,
          zoneId: zone.zoneId,
          phaseId: phase.id,
          at: now,
          snapshot,
          price: decision?.changed ? decision.newPrice : P0,
          decision,
        });
      }
    }
    return written;
  }

  /** Dùng cho cron: tính lại cho mọi show có đợt đang mở. */
  async recomputeAll(now: Date = new Date()): Promise<PriceChangeRecord[]> {
    const ids = await this.repo.listShowsWithActivePhase(now);
    const out: PriceChangeRecord[] = [];
    for (const id of ids) out.push(...(await this.recompute(id, now)));
    return out;
  }
}
