/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Hồ sơ PTTK mục 9.4 "Quy tắc thay đổi giá"
 *
 * RuleBasedPricingPolicy hiện thực PricingPolicy. Đây là HÀM THUẦN (không đọc CSDL,
 * không đọc đồng hồ) nên kiểm thử độc lập được và được dùng lại nguyên vẹn bởi
 * phần cải tiến (mô phỏng what-if).
 *
 *   O = S / C
 *   p = clamp((now − Ts) / (Te − Ts), 0, 1)
 *   E = K_(j−1) + (K_j − K_(j−1)) · p
 *   D = O − E
 *
 *   a_cầu:      D > +0,05  → min(15%, D − 0,05)   (chỉ khi S ≥ max(5, 2% × C), nếu không = 0)
 *               |D| ≤ 0,05 → 0                    (vùng chết)
 *               D < −0,05  → max(−10%, (D + 0,05) × 2/3)
 *   a_giờ_chót: −10% nếu còn ≤ 72 giờ tới đêm diễn và O < 50%
 *   a_giữ:      +5%  nếu H ≥ max(5, 15% × (C − S))
 *
 *   m = clamp(a_cầu + a_giờ_chót + a_giữ, −20%, +20%);  u = m / 20%
 *   P′ = clamp(round_1000(B + u (Ce − B)), F, Ce)   nếu u ≥ 0
 *   P′ = clamp(round_1000(B + u (B − F)),  F, Ce)   nếu u < 0
 *
 *   Giới hạn thay đổi:
 *     |P′ − P0| < 2% × B → giữ P0
 *     P_mới = P0 + sign(P′ − P0) × min(|P′ − P0|, 10% × B)
 *     ép trong [P24 − 30% × B, P24 + 30% × B] và [F, Ce]
 *     (10%, 2%, 30% × B đều làm tròn xuống 1.000 đ)
 */
import { DEFAULT_PRICING_RULES, clamp, floorTo, roundTo } from "./rules";
import type {
  Adjustments,
  DemandSnapshot,
  Money,
  PriceBounds,
  PricingDecision,
  PricingPolicy,
  PricingRules,
} from "./types";

// ---------- Các đại lượng nhu cầu (DemandSnapshot.occupancy()/expected()) ----------

export function occupancy(d: DemandSnapshot): number {
  return d.capacity > 0 ? d.sold / d.capacity : 0;
}

export function expected(d: DemandSnapshot): number {
  return d.expectedPrev + (d.expectedEnd - d.expectedPrev) * d.phaseProgress;
}

// ---------- Các hệ số ----------

export function demandAdjustment(D: number, sold: number, capacity: number, r: PricingRules): number {
  if (D > r.deadZone) {
    const enoughSales = sold >= Math.max(r.minSoldAbs, r.minSoldRatio * capacity);
    return enoughSales ? Math.min(r.demandUpMax, D - r.deadZone) : 0;
  }
  if (D >= -r.deadZone) return 0; // vùng chết
  return Math.max(-r.demandDownMax, (D + r.deadZone) * r.demandDownSlope);
}

export function lastMinuteAdjustment(hoursToShow: number, O: number, r: PricingRules): number {
  return hoursToShow <= r.lastMinuteHours && O < r.lastMinuteOccupancy ? r.lastMinuteAdj : 0;
}

export function holdAdjustment(held: number, sold: number, capacity: number, r: PricingRules): number {
  return held >= Math.max(r.holdMinAbs, r.holdRatio * (capacity - sold)) ? r.holdAdj : 0;
}

// ---------- Giá mục tiêu P′ ----------

/** Ánh xạ u ∈ [−1, 1] vào toàn bộ biên [F, Ce] của BTC. */
export function targetPrice(u: number, b: PriceBounds, r: PricingRules): Money {
  const raw = u >= 0 ? b.base + u * (b.ceiling - b.base) : b.base + u * (b.base - b.floor);
  return clamp(roundTo(raw, r.roundTo), b.floor, b.ceiling);
}

// ---------- Giới hạn thay đổi ----------

export interface LimitResult {
  price: Money;
  /** Các giới hạn đã tác động: deadband | step10 | cap24h | bounds */
  limitedBy: string[];
}

export function applyChangeLimits(
  P0: Money,
  target: Money,
  P24: Money,
  b: PriceBounds,
  r: PricingRules,
): LimitResult {
  const limitedBy: string[] = [];
  const diff = target - P0;
  const minChange = floorTo(r.minChangeRatio * b.base, r.roundTo);
  const step = floorTo(r.stepRatio * b.base, r.roundTo);
  const cap24 = floorTo(r.dailyCapRatio * b.base, r.roundTo);

  let price = P0;
  if (diff === 0 || Math.abs(diff) < minChange) {
    if (diff !== 0) limitedBy.push("deadband");
  } else {
    const move = Math.min(Math.abs(diff), step);
    if (move < Math.abs(diff)) limitedBy.push("step10");
    price = P0 + Math.sign(diff) * move;

    // Biên trượt 24 giờ quanh P24. Không bao giờ kéo giá ngược chiều mục tiêu
    // (nếu P0 đã nằm ngoài cửa sổ thì chỉ đứng yên).
    const lo = Math.min(P0, P24 - cap24);
    const hi = Math.max(P0, P24 + cap24);
    const capped = clamp(price, lo, hi);
    if (capped !== price) limitedBy.push("cap24h");
    price = capped;

    // Nếu giới hạn 24 giờ cắt bước còn nhỏ hơn ngưỡng 2% × B thì không đổi
    // (tránh các lần đổi giá vụn sát mép cửa sổ 24 giờ).
    if (price !== P0 && Math.abs(price - P0) < minChange) {
      limitedBy.push("deadband");
      price = P0;
    }
  }

  // NFR-03: luôn trong [sàn, trần] — áp dụng sau cùng, kể cả khi BTC vừa sửa biên.
  const bounded = clamp(price, b.floor, b.ceiling);
  if (bounded !== price) limitedBy.push("bounds");
  return { price: bounded, limitedBy };
}

// ---------- Policy ----------

export class RuleBasedPricingPolicy implements PricingPolicy {
  constructor(readonly rules: PricingRules = DEFAULT_PRICING_RULES) {}

  /** Tổng hệ số + giá mục tiêu P′ (chưa áp giới hạn thay đổi). */
  evaluate(b: PriceBounds, d: DemandSnapshot) {
    const r = this.rules;
    const O = occupancy(d);
    const E = expected(d);
    const D = O - E;
    const adjustments: Adjustments = {
      demand: demandAdjustment(D, d.sold, d.capacity, r),
      lastMinute: lastMinuteAdjustment(d.hoursToShow, O, r),
      hold: holdAdjustment(d.held, d.sold, d.capacity, r),
    };
    const m = clamp(
      adjustments.demand + adjustments.lastMinute + adjustments.hold,
      -r.totalAdjCap,
      r.totalAdjCap,
    );
    const u = m / r.totalAdjCap;
    return { O, E, D, adjustments, m, u, target: targetPrice(u, b, r) };
  }

  quote(b: PriceBounds, d: DemandSnapshot): PricingDecision {
    const ev = this.evaluate(b, d);
    const lim = applyChangeLimits(d.currentPrice, ev.target, d.price24hAgo, b, this.rules);
    return {
      occupancy: ev.O,
      expected: ev.E,
      deviation: ev.D,
      adjustments: ev.adjustments,
      m: ev.m,
      u: ev.u,
      target: ev.target,
      newPrice: lim.price,
      changed: lim.price !== d.currentPrice,
      rule: describeRule(ev.adjustments, ev.u, lim.limitedBy),
    };
  }
}

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function describeRule(a: Adjustments, u: number, limitedBy: string[]): string {
  const parts = [
    `a_cau=${pct(a.demand)}`,
    `a_gio_chot=${pct(a.lastMinute)}`,
    `a_giu=${pct(a.hold)}`,
    `u=${u >= 0 ? "+" : ""}${u.toFixed(2)}`,
  ];
  if (limitedBy.length) parts.push(`limit=${limitedBy.join(",")}`);
  return parts.join(";");
}
