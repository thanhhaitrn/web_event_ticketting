/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 2 — MÔ PHỎNG WHAT-IF  (mục 9.6, S2-16)
 *
 * Dành cho BTC trước khi mở bán: chọn sàn/trần, k và kịch bản cầu (nhanh / đều / chậm),
 * xem doanh thu, tỷ lệ lấp đầy, số lần đổi giá, số lần đảo chiều của giá cố định so với
 * giá động. Mô phỏng Monte Carlo DÙNG LẠI CHÍNH RuleBasedPricingPolicy của phần 01.
 *
 * Mô hình cầu (giả định, giống phần "Kết quả mô phỏng" của hồ sơ):
 *   - Mỗi chu kỳ 15 phút, số khách đến ~ Poisson(λ_t · (B / P)^ε), ε = 1,2.
 *   - Tổng cầu ở giá B = demandRatio × C, phân bố theo thời gian theo demandDensity():
 *       even / front / spike / drop / late (xem DemandShape).
 *   - Mỗi khách mua 1 vé nếu còn chỗ. Không mô phỏng giữ ghế (H = 0).
 * → Chỉ dùng để SO SÁNH các chính sách, không phải dự báo doanh thu thật.
 */
import { RuleBasedPricingPolicy } from "@/lib/pricing/rule-based-pricing-policy";
import { DEFAULT_PRICING_RULES, clamp, roundTo, applyLegacyStep } from "./what-if-legacy";
import type { PriceBounds, PricingDecision, PricingRules } from "@/lib/pricing/types";

export type PolicyKind = "fixed" | "v1" | "v1.1-no-deadband" | "v1.1";

export const POLICY_LABEL_VI: Record<PolicyKind, string> = {
  fixed: "Giá cố định",
  v1: "v1 (cũ: B × (1 + a))",
  "v1.1-no-deadband": "v1.1 chưa có deadband",
  "v1.1": "v1.1 + deadband 2% × B",
};

/**
 * Hình dạng phân bố cầu theo thời gian trong đợt (x = tiến độ đợt ∈ [0, 1]).
 * Mọi mật độ đều có tích phân = 1 nên tổng cầu luôn bằng demandRatio × C:
 *   even  — đều:                         1
 *   front — dồn đầu đợt (fan săn vé):    2(1 − x)
 *   spike — bùng nổ giữa đợt (viral):    0,5 nền + 2,5 trong x ∈ [0,4; 0,6)
 *   drop  — hụt cầu nửa sau (tin xấu):   1,6 khi x < 0,5; 0,4 khi x ≥ 0,5
 *   late  — dồn cuối đợt (mua sát ngày): 2x
 */
export type DemandShape = "front" | "even" | "spike" | "drop" | "late";

export const DEMAND_SHAPES: readonly DemandShape[] = ["even", "front", "spike", "drop", "late"];

export const DEMAND_SHAPE_LABEL_VI: Record<DemandShape, string> = {
  even: "Đều suốt đợt",
  front: "Dồn đầu đợt (săn vé)",
  spike: "Bùng nổ giữa đợt (viral)",
  drop: "Hụt cầu nửa sau",
  late: "Dồn cuối đợt (mua sát ngày)",
};

export function demandDensity(shape: DemandShape, x: number): number {
  switch (shape) {
    case "front": return 2 * (1 - x);
    case "spike": return 0.5 + (x >= 0.4 && x < 0.6 ? 2.5 : 0);
    case "drop": return x < 0.5 ? 1.6 : 0.4;
    case "late": return 2 * x;
    default: return 1;
  }
}

export interface DemandScenario {
  name: string;
  /** Tổng cầu ở giá cơ bản, tính theo bội số sức chứa (1,6 = 160% C). */
  demandRatio: number;
  shape: DemandShape;
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
  /** Ghi đè một phần PricingRules (vùng chết, bước, biên 24 giờ…) để thử nghiệm; bỏ trống = mặc định. */
  rules?: Partial<PricingRules>;
}

/** PricingRules thực dùng cho một lần mô phỏng: mặc định ← k của input ← rules ghi đè. */
export function effectiveRules(input: Pick<WhatIfInput, "k"> & { rules?: Partial<PricingRules> }): PricingRules {
  return { ...DEFAULT_PRICING_RULES, k: input.k, ...defined(input.rules ?? {}) };
}

/** Bỏ các khoá undefined trước khi trộn với mặc định (spread không bỏ qua undefined). */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function withDefaults(config: Partial<WhatIfInput>): WhatIfInput {
  return { ...DEFAULT_WHAT_IF, ...defined(config) };
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

export const TICKS_PER_DAY = 96; // 15 phút

export function phaseTicks(days: number) {
  return Math.max(1, Math.round(days * TICKS_PER_DAY));
}

export interface SimulationPoint {
  tick: number;
  price: number;
  previousPrice: number;
  soldAtQuote: number;
  sold: number;
  added: number;
  expected: number;
  decision: PricingDecision | null;
  /** p = t / T — tiến độ đợt lúc tính giá. */
  progress: number;
  /** Giờ còn lại tới đêm diễn lúc tính giá. */
  hoursToShow: number;
  /** P24 — giá 24 giờ trước (mốc của biên trượt 24 giờ). */
  price24hAgo: number;
  /** λ — số khách kỳ vọng trong 15 phút tới ở giá vừa báo. */
  lambda: number;
}

interface Trace {
  points: SimulationPoint[];
  purchases: Record<number, number>;
}

interface RunOutcome {
  revenue: number;
  sold: number;
  fill: number;
  changes: number;
  reversals: number;
  violations: number;
  /** Chu kỳ bán hết vé, −1 nếu không hết. */
  soldOutTick: number;
}

function runOnce(
  input: WhatIfInput,
  sc: DemandScenario,
  kind: PolicyKind,
  rnd: () => number,
  trace?: Trace,
  /** Cộng dồn doanh thu tích luỹ tại cuối mỗi chu kỳ (để vẽ đường doanh thu trung bình). */
  curve?: Float64Array,
): RunOutcome {
  const { capacity: C, bounds: b } = input;
  const T = phaseTicks(input.phaseDays);
  const base = effectiveRules(input);
  const rules: PricingRules = { ...base, minChangeRatio: kind === "v1.1-no-deadband" ? 0 : base.minChangeRatio };
  const k = rules.k;
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
  let soldOutTick = -1;

  let t = 0;
  for (; t < T; t++) {
    // Close the chart before quoting a new price once the last available ticket has sold.
    if (trace && sold >= C) break;
    const previousPrice = P;
    let decision: PricingDecision | null = null;
    const hoursToShow = (T - t) / 4 + input.showAfterPhaseHours;
    const price24hAgo = t >= TICKS_PER_DAY ? prices[t - TICKS_PER_DAY] : b.base;
    // 1) Tính lại giá đầu chu kỳ
    if (kind !== "fixed") {
      const snapshot = {
        capacity: C,
        sold,
        held: 0,
        phaseProgress: t / T,
        hoursToShow,
        expectedPrev: 0,
        expectedEnd: k,
        currentPrice: P,
        price24hAgo,
      };
      let next: number;
      if (kind === "v1") {
        const ev = policy.evaluate(b, snapshot);
        const target = clamp(roundTo(b.base * (1 + ev.m), rules.roundTo), b.floor, b.ceiling);
        next = applyLegacyStep(P, target, b, rules);
      } else {
        decision = policy.quote(b, snapshot);
        next = decision.newPrice;
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

    // λ = cầu của chu kỳ × (B / P)^ε — giá cao hơn giá cơ bản thì ít khách hơn
    const x = (t + 0.5) / T;
    const w = demandDensity(sc.shape, x) / T;
    const lambda = totalDemand * w * Math.pow(b.base / P, input.elasticity);

    // Purchases at this boundary lock the quoted price and influence the next quote.
    if (trace) {
      const soldAtQuote = sold;
      const added = Math.min(trace.purchases[t] ?? 0, C - sold);
      sold += added;
      revenue += added * P;
      trace.points.push({ tick: t, price: P, previousPrice, soldAtQuote, sold, added,
        expected: k * t / T, decision, progress: t / T, hoursToShow, price24hAgo, lambda });
    }

    // 2) Khách đến và mua
    const n = Math.min(poisson(lambda, rnd), C - sold);
    sold += n;
    revenue += n * P;
    if (soldOutTick < 0 && sold >= C) soldOutTick = t;
    if (curve) curve[t] += revenue;
  }
  if (trace && trace.points.at(-1)?.sold !== C) {
    trace.points.push({ tick: t, price: P, previousPrice: P, soldAtQuote: sold, sold,
      added: 0, expected: k * t / T, decision: null, progress: t / T,
      hoursToShow: (T - t) / 4 + input.showAfterPhaseHours,
      price24hAgo: t >= TICKS_PER_DAY ? prices[t - TICKS_PER_DAY] : b.base, lambda: 0 });
  }
  return { revenue, sold, fill: sold / C, changes, reversals, violations, soldOutTick };
}

export type DemoConfig = Pick<WhatIfInput, "capacity" | "bounds" | "phaseDays" | "seed"> &
  Partial<Pick<WhatIfInput, "showAfterPhaseHours" | "elasticity" | "runs" | "rules">>;
export type DailyDemandConfig = DemoConfig & { dailyDemand: number; shape?: DemandShape };

export function dailyDemandScenario({ dailyDemand, phaseDays, capacity, shape = "even" }: DailyDemandConfig): DemandScenario {
  if (!Number.isFinite(dailyDemand) || dailyDemand < 0) throw new Error("Số vé dự kiến mỗi ngày phải từ 0 trở lên.");
  if (!DEMAND_SHAPES.includes(shape)) throw new Error("Diễn biến nhu cầu không hợp lệ.");
  return {
    name: "Dự báo theo ngày",
    demandRatio: dailyDemand * phaseDays / capacity,
    shape,
  };
}

export function simulateTimeline(config: DemoConfig, scenario: DemandScenario, purchases: Record<number, number> = {}) {
  const input = withDefaults(config);
  validate(input);
  return traceTimeline(input, scenario, purchases);
}

function traceTimeline(input: WhatIfInput, scenario: DemandScenario, purchases: Record<number, number>) {
  const trace: Trace = { points: [], purchases };
  runOnce(input, scenario, "v1.1", mulberry32(input.seed + hash(scenario.name)), trace);
  return trace.points;
}

// ---------- Monte Carlo ----------

export function runWhatIf(partial: Partial<WhatIfInput> = {}): PolicyResult[] {
  const input: WhatIfInput = { ...DEFAULT_WHAT_IF, ...partial };
  validate(input);
  return comparePolicies(input);
}

function comparePolicies(input: WhatIfInput) {
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

// ---------- Phân tích chi tiết cho tab "So sánh doanh thu" ----------

export interface PolicyDetail extends PolicyResult {
  policy: "fixed" | "v1.1";
  label: string;
  /** Giá bình quân mỗi vé = tổng doanh thu / tổng vé bán. */
  avgTicketPrice: number;
  /** Phân vị doanh thu giữa các lần chạy. */
  p10: number;
  p50: number;
  p90: number;
  /** Tỷ lệ số lần chạy bán hết vé và ngày hết vé trung bình (trong các lần hết vé). */
  soldOutShare: number;
  soldOutDay: number | null;
  /** Doanh thu tích luỹ trung bình, lấy mẫu đều theo thời gian (phần tử đầu = 0 lúc mở bán). */
  curve: number[];
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function detailFor(input: WhatIfInput, sc: DemandScenario, kind: "fixed" | "v1.1", samples: number): PolicyDetail {
  const T = phaseTicks(input.phaseDays);
  const rnd = mulberry32(input.seed + hash(sc.name)); // cùng seed cho cả hai chính sách
  const curve = new Float64Array(T);
  const revenues: number[] = [];
  let sold = 0, fill = 0, ch = 0, rv = 0, soldOutRuns = 0, soldOutTicks = 0;
  let boundViolations = 0;
  for (let i = 0; i < input.runs; i++) {
    const r = runOnce(input, sc, kind, rnd, undefined, curve);
    revenues.push(r.revenue);
    boundViolations += r.violations;
    sold += r.sold; fill += r.fill; ch += r.changes; rv += r.reversals;
    if (r.soldOutTick >= 0) { soldOutRuns++; soldOutTicks += r.soldOutTick + 1; }
  }
  const n = input.runs;
  const total = revenues.reduce((a, b) => a + b, 0);
  const sorted = [...revenues].sort((a, b) => a - b);
  const pts = Math.max(2, Math.min(samples, T + 1));
  const sampled = Array.from({ length: pts }, (_, j) => {
    const t = Math.round((j * T) / (pts - 1)) - 1; // số chu kỳ đã qua − 1
    return t < 0 ? 0 : curve[t] / n;
  });
  return {
    policy: kind,
    scenario: sc.name,
    policyLabel: POLICY_LABEL_VI[kind],
    boundViolations,
    label: kind === "fixed" ? "Giá cố định" : "Giá động",
    revenue: total / n,
    fillRate: fill / n,
    changesPerDay: ch / n / input.phaseDays,
    reversalsPerDay: rv / n / input.phaseDays,
    avgTicketPrice: sold > 0 ? total / sold : 0,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    soldOutShare: soldOutRuns / n,
    soldOutDay: soldOutRuns ? soldOutTicks / soldOutRuns / TICKS_PER_DAY : null,
    curve: sampled,
  };
}

/** Giá cố định và giá động v1.1 trên cùng kịch bản, kèm phân phối và đường doanh thu tích luỹ. */
export function comparePolicyDetails(config: DailyDemandConfig, samples = 160) {
  const input = withDefaults({ ...config, policies: ["fixed", "v1.1"] });
  const scenario = dailyDemandScenario(config);
  input.scenarios = [scenario];
  validate(input);
  return { fixed: detailFor(input, scenario, "fixed", samples), dynamic: detailFor(input, scenario, "v1.1", samples) };
}

/** Các mức cầu (bội số sức chứa trong cả đợt) dùng cho biểu đồ độ nhạy. */
export const SENSITIVITY_RATIOS = [0.3, 0.5, 0.7, 0.85, 1, 1.15, 1.3, 1.6, 2, 2.5, 3];

export interface SensitivityPoint {
  ratio: number;
  dailyDemand: number;
  fixed: number;
  dynamic: number;
  uplift: number;
  fillFixed: number;
  fillDynamic: number;
}

/** Chênh lệch doanh thu giá động − giá cố định khi chỉ thay đổi tổng cầu, các thiết lập khác giữ nguyên. */
export function demandSensitivity(config: DailyDemandConfig, runs = 40, ratios = SENSITIVITY_RATIOS): SensitivityPoint[] {
  const input = withDefaults({ ...config, runs, policies: ["fixed", "v1.1"] });
  input.scenarios = [dailyDemandScenario(config)];
  validate(input);
  const extra = config.dailyDemand * config.phaseDays / config.capacity;
  const all = [...new Set([...ratios, extra])].filter((r) => r >= 0).sort((a, b) => a - b);
  return all.map((ratio) => {
    const sc: DemandScenario = { name: `Độ nhạy ${ratio}`, demandRatio: ratio, shape: config.shape ?? "even" };
    const [fixed, dynamic] = comparePolicies({ ...input, scenarios: [sc] });
    return {
      ratio,
      dailyDemand: ratio * config.capacity / config.phaseDays,
      fixed: fixed.revenue,
      dynamic: dynamic.revenue,
      uplift: fixed.revenue > 0 ? dynamic.revenue / fixed.revenue - 1 : 0,
      fillFixed: fixed.fillRate,
      fillDynamic: dynamic.fillRate,
    };
  });
}

export type EventTierInput = DailyDemandConfig & { zoneId: string; showAfterPhaseHours: number };

export function simulateEventTier(tier: EventTierInput) {
  const scenario = dailyDemandScenario(tier);
  const input: WhatIfInput = { ...DEFAULT_WHAT_IF, ...tier, scenarios: [scenario], policies: ["fixed", "v1.1"] };
  // Event quotas and dates come from saved records; the sandbox form limits apply only to manual inputs.
  validateModel(input);
  const [fixed, dynamic] = comparePolicies(input);
  const points = traceTimeline(input, scenario, {}).map(({ tick, price, sold, expected }) => ({ tick, price, sold, expected }));
  return { zoneId: tier.zoneId, fixed: Math.round(fixed.revenue), dynamic: Math.round(dynamic.revenue), points };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function validate(i: WhatIfInput) {
  validateModel(i);
  if (i.capacity > 50_000) throw new Error("Sức chứa phải trong 1..50.000.");
  if (i.phaseDays > 60) throw new Error("Thời lượng đợt phải trong (0, 60] ngày.");
}

function validateModel(i: WhatIfInput) {
  const { floor, base, ceiling } = i.bounds;
  if (!(floor > 0 && floor <= base && base <= ceiling)) throw new Error("Giá cơ bản phải nằm trong khoảng giá sàn và giá trần.");
  if (!(Number.isFinite(i.capacity) && i.capacity >= 1)) throw new Error("Sức chứa phải từ 1 ghế trở lên.");
  if (!(Number.isFinite(i.phaseDays) && i.phaseDays > 0)) throw new Error("Đợt mở bán phải có thời lượng dương.");
  if (!(i.runs >= 1 && i.runs <= 1000)) throw new Error("Số lần chạy phải trong 1..1.000.");
  if (!(i.k > 0 && i.k <= 1)) throw new Error("k phải trong (0, 1].");
  if (!(Number.isFinite(i.showAfterPhaseHours) && i.showAfterPhaseHours >= 0)) {
    throw new Error("Khoảng cách từ cuối đợt tới đêm diễn phải từ 0 giờ trở lên.");
  }
  if (i.scenarios.some((sc) => !DEMAND_SHAPES.includes(sc.shape))) throw new Error("Diễn biến nhu cầu không hợp lệ.");
  if (!(Number.isFinite(i.elasticity) && i.elasticity >= 0 && i.elasticity <= 5)) throw new Error("Độ nhạy giá ε phải trong [0, 5].");
  validateRules(effectiveRules(i));
}

/** Miền hợp lệ của từng tham số — dùng chung cho form và mô phỏng. */
export const RULE_LIMITS: Record<keyof PricingRules, [number, number]> = {
  k: [0.05, 1],
  recomputeIntervalMinutes: [15, 15],
  deadZone: [0, 0.5],
  demandUpMax: [0, 1],
  demandDownMax: [0, 1],
  demandDownSlope: [0, 5],
  minSoldAbs: [0, 100_000],
  minSoldRatio: [0, 1],
  lastMinuteHours: [0, 24 * 60],
  lastMinuteOccupancy: [0, 1],
  lastMinuteAdj: [-1, 0],
  holdAdj: [0, 1],
  holdMinAbs: [0, 100_000],
  holdRatio: [0, 1],
  totalAdjCap: [0.01, 1],
  stepRatio: [0.001, 1],
  dailyCapRatio: [0.001, 3],
  minChangeRatio: [0, 0.5],
  roundTo: [1, 1_000_000],
};

export function validateRules(r: PricingRules) {
  for (const [key, [lo, hi]] of Object.entries(RULE_LIMITS) as [keyof PricingRules, [number, number]][]) {
    const v = r[key];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) throw new Error(`Tham số ${key} phải trong [${lo}; ${hi}].`);
  }
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
