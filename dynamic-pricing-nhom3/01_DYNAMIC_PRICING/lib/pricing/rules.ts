/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Hồ sơ PTTK mục 9.2, 9.3
 *
 * Hằng số mặc định PricingRules và đường bán kỳ vọng cộng dồn K_j.
 */
import type { PricingRules } from "./types";

export const DEFAULT_PRICING_RULES: Readonly<PricingRules> = Object.freeze({
  k: 0.9,
  recomputeIntervalMinutes: 15,

  deadZone: 0.05,
  demandUpMax: 0.15,
  demandDownMax: 0.1,
  demandDownSlope: 2 / 3,
  minSoldAbs: 5,
  minSoldRatio: 0.02,

  lastMinuteHours: 72,
  lastMinuteOccupancy: 0.5,
  lastMinuteAdj: -0.1,

  holdAdj: 0.05,
  holdMinAbs: 5,
  holdRatio: 0.15,

  totalAdjCap: 0.2,

  stepRatio: 0.1,
  dailyCapRatio: 0.3,
  minChangeRatio: 0.02,
  roundTo: 1000,
});

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Mục 9.2 (2): K_j = k × (tổng thời lượng các đợt tới hết đợt j) / (tổng thời lượng mọi đợt).
 * Trả về mảng K có độ dài n + 1: K[0] = 0 (trước đợt đầu), K[j] = K cuối đợt thứ j (đánh số từ 1).
 * Như vậy với đợt có chỉ số i (0-based) thì K_(j−1) = K[i], K_j = K[i + 1].
 */
export function cumulativeExpected(phases: TimeRange[], k: number): number[] {
  const durations = phases.map((p) => Math.max(0, p.end.getTime() - p.start.getTime()));
  const total = durations.reduce((a, b) => a + b, 0);
  const K = [0];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    K.push(total > 0 ? (k * acc) / total : 0);
  }
  return K;
}

/** p = clamp((now − Ts) / (Te − Ts), 0, 1). */
export function phaseProgress(phase: TimeRange, now: Date): number {
  const span = phase.end.getTime() - phase.start.getTime();
  if (span <= 0) return 1;
  return clamp((now.getTime() - phase.start.getTime()) / span, 0, 1);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** round_1000(x): làm tròn tới bội gần nhất của `unit`. */
export function roundTo(x: number, unit: number): number {
  return Math.round(x / unit) * unit;
}

/** Làm tròn xuống bội của `unit` (dùng cho bước 10%, ngưỡng 2%, biên 30% để không vượt NFR-03). */
export function floorTo(x: number, unit: number): number {
  return Math.floor(x / unit) * unit;
}
