/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 2 — phụ trợ cho mô phỏng what-if
 *
 * Công thức v1 cũ (SD-05 bước 7, 10) chỉ dùng làm ĐỐI CHỨNG trong mô phỏng:
 *   P′ = clamp(B × (1 + a), F, Ce);  bước ≤ 10% × B;  không có deadband, không giới hạn 24 giờ.
 * Không dùng trong hệ thống thật.
 */
import { DEFAULT_PRICING_RULES, clamp, floorTo, roundTo } from "@/lib/pricing/rules";
import type { Money, PriceBounds, PricingRules } from "@/lib/pricing/types";

export { DEFAULT_PRICING_RULES, clamp, roundTo };

export function applyLegacyStep(P0: Money, target: Money, b: PriceBounds, r: PricingRules): Money {
  const step = floorTo(r.stepRatio * b.base, r.roundTo);
  const diff = target - P0;
  const next = P0 + Math.sign(diff) * Math.min(Math.abs(diff), step);
  return clamp(next, b.floor, b.ceiling);
}
