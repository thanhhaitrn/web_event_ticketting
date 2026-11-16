/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 2 — MÔ PHỎNG WHAT-IF  (mục 9.6, S2-16)
 *
 * Dành cho BTC trước khi mở bán: chọn sàn/trần, k và kịch bản cầu (nhanh / đều / chậm),
 * xem doanh thu, tỷ lệ lấp đầy, số lần đổi giá, số lần đảo chiều của giá cố định so với
 * giá động. Mô phỏng Monte Carlo DÙNG LẠI CHÍNH RuleBasedPricingPolicy của phần 01.
 *
 * Mô hình cầu (giả định, giống phần "Kết quả mô phỏng" của hồ sơ):
 *   - Mỗi chu kỳ 15 phút, số khách đến ~ Poisson(λ_t · (B / P)^ε), ε = 1,2.
 *   - Tổng cầu ở giá B = demandRatio × C, phân bố theo thời gian:
 *       "front" (dồn đầu đợt): mật độ ∝ 2(1 − x);  "even": đều.
 *   - Mỗi khách mua 1 vé nếu còn chỗ. Không mô phỏng giữ ghế (H = 0).
 * → Chỉ dùng để SO SÁNH các chính sách, không phải dự báo doanh thu thật.
 */
import { RuleBasedPricingPolicy } from "@/lib/pricing/rule-based-pricing-policy";
import { DEFAULT_PRICING_RULES, clamp, roundTo, applyLegacyStep } from "./what-if-legacy";
import type { PriceBounds, PricingRules } from "@/lib/pricing/types";

export type PolicyKind = "fixed" | "v1" | "v1.1-no-deadband" | "v1.1";

export const POLICY_LABEL_VI: Record<PolicyKind, string> = {
  fixed: "Giá cố định",
  v1: "v1 (cũ: B × (1 + a))",
  "v1.1-no-deadband": "v1.1 chưa có deadband",
  "v1.1": "v1.1 + deadband 2% × B",
};

export interface DemandScenario {
  name: string;
  /** Tổng cầu ở giá cơ bản, tính theo bội số sức chứa (1,6 = 160% C). */
  demandRatio: number;
  shape: "front" | "even";
}

export const DEFAULT_SCENARIOS: DemandScenario[] = [
  { name: "Bán nhanh (cầu 160% C, dồn đầu đợt)", demandRatio: 1.6, shape: "front" },
  { name: "Bán đều (cầu 95% C)", demandRatio: 0.95, shape: "even" },
  { name: "Bán chậm (cầu 45% C)", demandRatio: 0.45, shape: "even" },
];

export interface WhatIfInput {
  capacity: number;
  bounds: PriceBounds;
  phaseDays: number;
  /** Số giờ từ cuối đợt tới đêm diễn (quy tắc giờ chót chỉ chạy khi ≤ 72 giờ). */
  showAfterPhaseHours: number;
  k: number;
  elasticity: number;
  runs: number;
  seed: number;
  scenarios: DemandScenario[];
  policies: PolicyKind[];
}

export const DEFAULT_WHAT_IF: WhatIfInput = {
  capacity: 1000,
  bounds: { floor: 1_600_000, base: 2_000_000, ceiling: 3_000_000 },
  phaseDays: 10,
  showAfterPhaseHours: 240,
  k: 0.9,
  elasticity: 1.2,
  runs: 200,
  seed: 20261111,
  scenarios: DEFAULT_SCENARIOS,
  policies: ["fixed", "v1", "v1.1-no-deadband", "v1.1"],
};

export interface PolicyResult {
  scenario: string;
  policy: PolicyKind;
  policyLabel: string;
  revenue: number; // đồng, trung bình
  fillRate: number; // 0..1
  changesPerDay: number;
  reversalsPerDay: number;
  boundViolations: number; // tổng qua mọi lần chạy — phải = 0 (NFR-03)
}

// ---------- RNG có seed để kết quả tái lập được ----------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function poisson(lambda: number, rnd: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= rnd();
    } while (p > L);
    return k - 1;
  }
  // xấp xỉ chuẩn cho λ lớn
  const u = Math.max(rnd(), 1e-12);
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

// ---------- Một lần chạy ----------

const TICKS_PER_DAY = 96; // 15 phút

function runOnce(input: WhatIfInput, sc: DemandScenario, kind: PolicyKind, rnd: () => number) {
  const { capacity: C, bounds: b, k } = input;
  const T = Math.round(input.phaseDays * TICKS_PER_DAY);
  const rules: PricingRules = {
    ...DEFAULT_PRICING_RULES,
    k,
    minChangeRatio: kind === "v1.1-no-deadband" ? 0 : DEFAULT_PRICING_RULES.minChangeRatio,
  };
  const policy = new RuleBasedPricingPolicy(rules);
  const totalDemand = sc.demandRatio * C;

  const prices: number[] = [];
  let P = b.base;
  let sold = 0;
  let revenue = 0;
  let changes = 0;
  let reversals = 0;
  let lastDir = 0;
  let violations = 0;

  for (let t = 0; t < T; t++) {
    // 1) Tính lại giá đầu chu kỳ
    if (kind !== "fixed") {
      const snapshot = {
        capacity: C,
        sold,
        held: 0,
        phaseProgress: t / T,
        hoursToShow: (T - t) / 4 + input.showAfterPhaseHours,
        expectedPrev: 0,
        expectedEnd: k,
        currentPrice: P,
        price24hAgo: t >= TICKS_PER_DAY ? prices[t - TICKS_PER_DAY] : b.base,
      };
      let next: number;
      if (kind === "v1") {
        const ev = policy.evaluate(b, snapshot);
        const target = clamp(roundTo(b.base * (1 + ev.m), rules.roundTo), b.floor, b.ceiling);
        next = applyLegacyStep(P, target, b, rules);
      } else {
        next = policy.quote(b, snapshot).newPrice;
      }
      if (next !== P) {
        const dir = Math.sign(next - P);
        if (lastDir !== 0 && dir !== lastDir) reversals++;
        lastDir = dir;
        changes++;
        P = next;
      }
      if (P < b.floor || P > b.ceiling) violations++;
    }
    prices.push(P);

    // 2) Khách đến và mua
    const x = (t + 0.5) / T;
    const w = sc.shape === "front" ? (2 * (1 - x)) / T : 1 / T;
    const lambda = totalDemand * w * Math.pow(b.base / P, input.elasticity);
    const n = Math.min(poisson(lambda, rnd), C - sold);
    sold += n;
    revenue += n * P;
  }
  return { revenue, fill: sold / C, changes, reversals, violations };
}

// ---------- Monte Carlo ----------

export function runWhatIf(partial: Partial<WhatIfInput> = {}): PolicyResult[] {
  const input: WhatIfInput = { ...DEFAULT_WHAT_IF, ...partial };
  validate(input);
  const out: PolicyResult[] = [];
  for (const sc of input.scenarios) {
    for (const kind of input.policies) {
      // Cùng seed cho mọi chính sách trong một kịch bản → so sánh công bằng (common random numbers).
      const rnd = mulberry32(input.seed + hash(sc.name));
      let rev = 0, fill = 0, ch = 0, rv = 0, viol = 0;
      for (let i = 0; i < input.runs; i++) {
        const r = runOnce(input, sc, kind, rnd);
        rev += r.revenue; fill += r.fill; ch += r.changes; rv += r.reversals; viol += r.violations;
      }
      const n = input.runs;
      out.push({
        scenario: sc.name,
        policy: kind,
        policyLabel: POLICY_LABEL_VI[kind],
        revenue: rev / n,
        fillRate: fill / n,
        changesPerDay: ch / n / input.phaseDays,
        reversalsPerDay: rv / n / input.phaseDays,
        boundViolations: viol,
      });
    }
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function validate(i: WhatIfInput) {
  const { floor, base, ceiling } = i.bounds;
  if (!(floor > 0 && floor <= base && base <= ceiling)) throw new Error("Giá cơ bản phải nằm trong khoảng giá sàn và giá trần.");
  if (!(i.capacity >= 1 && i.capacity <= 50_000)) throw new Error("Sức chứa phải trong 1..50.000.");
  if (!(i.runs >= 1 && i.runs <= 1000)) throw new Error("Số lần chạy phải trong 1..1.000.");
  if (!(i.phaseDays > 0 && i.phaseDays <= 60)) throw new Error("Thời lượng đợt phải trong (0, 60] ngày.");
  if (!(i.k > 0 && i.k <= 1)) throw new Error("k phải trong (0, 1].");
}

/** Bảng văn bản để in ra console / đưa vào tài liệu. */
export function formatTable(rows: PolicyResult[]): string {
  const head = ["Kịch bản", "Chính sách", "Doanh thu (tỷ)", "Lấp đầy (%)", "Đổi giá/ngày", "Đảo chiều/ngày", "Vi phạm biên"];
  const body = rows.map((r) => [
    r.scenario,
    r.policyLabel,
    (r.revenue / 1e9).toFixed(3),
    (r.fillRate * 100).toFixed(1),
    r.changesPerDay.toFixed(1),
    r.reversalsPerDay.toFixed(1),
    String(r.boundViolations),
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...body.map((row) => row[c].length)));
  const line = (cells: string[]) => cells.map((x, c) => x.padEnd(widths[c])).join(" | ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("-|-"), ...body.map(line)].join("\n");
}
