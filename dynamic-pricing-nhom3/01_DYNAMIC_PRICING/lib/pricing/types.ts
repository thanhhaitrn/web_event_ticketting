/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Hồ sơ PTTK mục 9.3 (Bảng 10), Hình 9
 *
 * Kiểu dữ liệu dùng chung cho định giá động. Tiền là số nguyên VND.
 */

export type Money = number;

/** Value object PriceBounds (ZonePrice.floorPrice / basePrice / ceilingPrice). */
export interface PriceBounds {
  floor: Money; // F  — giá sàn
  base: Money; // B  — giá cơ bản
  ceiling: Money; // Ce — giá trần
}

/** Tham số quy tắc (PricingRules). V1 dùng hằng số mặc định; Sprint 3 BTC chỉnh được. */
export interface PricingRules {
  /** k — tỷ lệ bán kỳ vọng tích luỹ ở cuối đợt cuối cùng (mặc định 0,9). */
  k: number;
  /** Chu kỳ tính lại (phút). */
  recomputeIntervalMinutes: number;

  /** Vùng chết của D: |D| ≤ deadZone thì a_cầu = 0. */
  deadZone: number; // 0,05
  /** a_cầu tối đa khi bán nhanh. */
  demandUpMax: number; // 0,15
  /** |a_cầu| tối đa khi bán chậm. */
  demandDownMax: number; // 0,10
  /** Hệ số dốc khi bán chậm: (D + 0,05) × 2/3. */
  demandDownSlope: number; // 2/3
  /** Điều kiện tăng giá: S ≥ max(minSoldAbs, minSoldRatio × C). */
  minSoldAbs: number; // 5
  minSoldRatio: number; // 0,02

  /** Giờ chót: còn ≤ lastMinuteHours tới đêm diễn và O < lastMinuteOccupancy. */
  lastMinuteHours: number; // 72
  lastMinuteOccupancy: number; // 0,5
  lastMinuteAdj: number; // −0,10

  /** Giữ ghế: H ≥ max(holdMinAbs, holdRatio × (C − S)) thì cộng holdAdj. */
  holdAdj: number; // +0,05
  holdMinAbs: number; // 5
  holdRatio: number; // 0,15

  /** Tổng hệ số m bị kẹp trong [−totalAdjCap, +totalAdjCap]. */
  totalAdjCap: number; // 0,20

  /** Bước tối đa mỗi lần đổi = stepRatio × B (làm tròn xuống). */
  stepRatio: number; // 0,10
  /** Biên trượt 24 giờ = dailyCapRatio × B quanh P24. */
  dailyCapRatio: number; // 0,30
  /** Ngưỡng đổi tối thiểu (deadband) = minChangeRatio × B, làm tròn xuống. */
  minChangeRatio: number; // 0,02
  /** Làm tròn giá (đồng). */
  roundTo: number; // 1000
}

/**
 * DemandSnapshot — ảnh chụp nhu cầu của 1 khu vực × 1 đêm × đợt đang mở
 * tại thời điểm tính (Bảng 10).
 */
export interface DemandSnapshot {
  capacity: number; // C
  sold: number; // S (SeatReservation SOLD)
  held: number; // H (HELD, còn hạn)
  phaseProgress: number; // p ∈ [0, 1]
  hoursToShow: number; // giờ còn lại tới Show.startTime
  expectedPrev: number; // K_(j−1)
  expectedEnd: number; // K_j
  currentPrice: Money; // P0
  price24hAgo: Money; // P24
}

export interface Adjustments {
  demand: number; // a_cầu
  lastMinute: number; // a_giờ_chót
  hold: number; // a_giữ
}

/** Kết quả của PricingPolicy.quote(). */
export interface PricingDecision {
  occupancy: number; // O
  expected: number; // E
  deviation: number; // D
  adjustments: Adjustments;
  m: number; // tổng hệ số sau khi kẹp
  u: number; // m / 20% ∈ [−1, 1]
  target: Money; // P′ (giá mục tiêu)
  newPrice: Money; // P_mới sau giới hạn thay đổi
  changed: boolean; // P_mới ≠ P0
  /** Chuỗi mô tả quy tắc đã áp dụng — ghi vào PriceChange.rule. */
  rule: string;
}

/** Interface PricingPolicy (lib/domain.ts, Hình 9). */
export interface PricingPolicy {
  quote(bounds: PriceBounds, demand: DemandSnapshot): PricingDecision;
}
