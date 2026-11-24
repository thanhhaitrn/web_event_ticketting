/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 1 — GIÁ MINH BẠCH  (mục 9.6, S2-15)
 *
 * Dành cho khán giả: biểu đồ lịch sử giá của khu vực + nhãn xu hướng 24 giờ qua
 * (tăng / ổn định / giảm) + số ghế còn. Chỉ đọc PriceChange đã xảy ra, KHÔNG dự đoán
 * giá tương lai và KHÔNG lộ thông số nội bộ (O, E, quy tắc).
 */
import { DEFAULT_PRICING_RULES, clamp, floorTo } from "@/lib/pricing/rules";
import type { Money, PricingRules } from "@/lib/pricing/types";

export type Trend = "up" | "stable" | "down";

export const TREND_LABEL_VI: Record<Trend, string> = {
  up: "Giá tăng trong 24 giờ qua",
  stable: "Giá ổn định trong 24 giờ qua",
  down: "Giá giảm trong 24 giờ qua",
};

/**
 * So giá hiện hành với P24. Chênh dưới ngưỡng đổi tối thiểu (2% × B) coi là "ổn định",
 * nhất quán với deadband của công thức giá.
 */
export function trend24h(current: Money, price24hAgo: Money, base: Money, rules: PricingRules = DEFAULT_PRICING_RULES): Trend {
  const threshold = Math.max(1, floorTo(rules.minChangeRatio * base, rules.roundTo));
  const diff = current - price24hAgo;
  if (Math.abs(diff) < threshold) return "stable";
  return diff > 0 ? "up" : "down";
}

export interface PricePoint {
  at: Date;
  price: Money;
}

/**
 * Chuỗi điểm dạng bậc thang cho biểu đồ: bắt đầu ở giá cơ bản lúc mở đợt,
 * mỗi PriceChange là một bậc, kết thúc ở `now` với giá hiện hành.
 */
export function buildHistorySeries(
  changes: { createdAt: Date; newPrice: Money }[],
  base: Money,
  phaseStart: Date,
  now: Date,
): PricePoint[] {
  const sorted = changes
    .filter((c) => c.createdAt.getTime() >= phaseStart.getTime() && c.createdAt.getTime() <= now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pts: PricePoint[] = [{ at: phaseStart, price: base }];
  for (const c of sorted) pts.push({ at: c.createdAt, price: c.newPrice });
  const last = pts[pts.length - 1];
  if (last.at.getTime() < now.getTime()) pts.push({ at: now, price: last.price });
  return pts;
}

/** Giá tại thời điểm `at` trên chuỗi bậc thang (dùng tính P24 cho nhãn xu hướng). */
export function priceAt(series: PricePoint[], at: Date): Money {
  let p = series[0]?.price ?? 0;
  for (const pt of series) {
    if (pt.at.getTime() <= at.getTime()) p = pt.price;
    else break;
  }
  return p;
}

export interface PublicPriceView {
  zoneId: string;
  currentPrice: Money;
  /** Giá cơ bản của đợt — mốc so sánh cho khán giả. */
  basePrice: Money;
  /** (giá hiện hành − giá cơ bản) / giá cơ bản. */
  changeFromBase: number;
  /** Giá hiện hành − giá 24 giờ trước. */
  change24h: Money;
  /** Thấp nhất / cao nhất trong đợt này (theo lịch sử đã công bố). */
  lowest: Money;
  highest: Money;
  trend: Trend;
  trendLabel: string;
  seatsLeft: number;
  dynamic: boolean;
  /** Nhãn bắt buộc khi bật định giá động (S2-09). */
  notice: string | null;
  history: { at: string; price: Money }[];
}

export function buildPublicPriceView(input: {
  zoneId: string;
  base: Money;
  dynamic: boolean;
  bounds?: { floor: number; ceiling: number };
  phaseStart: Date;
  now: Date;
  capacity: number;
  sold: number;
  held: number;
  changes: { createdAt: Date; newPrice: Money }[];
}): PublicPriceView {
  const series = buildHistorySeries(input.dynamic ? input.changes : [], input.base, input.phaseStart, input.now);
  const latest = series[series.length - 1];
  const current = input.bounds ? clamp(latest.price, input.bounds.floor, input.bounds.ceiling) : latest.price;
  latest.price = current;
  const p24 = priceAt(series, new Date(input.now.getTime() - 24 * 3_600_000));
  const trend = trend24h(current, p24, input.base);
  const seen = series.map((p) => p.price);
  return {
    zoneId: input.zoneId,
    currentPrice: current,
    basePrice: input.base,
    changeFromBase: input.base > 0 ? (current - input.base) / input.base : 0,
    change24h: current - p24,
    lowest: Math.min(...seen),
    highest: Math.max(...seen),
    trend,
    trendLabel: TREND_LABEL_VI[trend],
    seatsLeft: Math.max(0, input.capacity - input.sold - input.held),
    dynamic: input.dynamic,
    notice: input.dynamic ? "Giá thay đổi theo nhu cầu" : null,
    history: series.map((p) => ({ at: p.at.toISOString(), price: p.price })),
  };
}
