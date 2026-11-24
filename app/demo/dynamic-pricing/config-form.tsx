"use client";

/**
 * Bảng thiết lập của trang mô phỏng: đợt bán, khung giá (nhập số tiền hoặc % so với giá cơ bản),
 * bảng tra giá theo công thức, nhu cầu và tham số thuật toán nâng cao.
 * Mọi thay đổi hợp lệ được áp dụng tự động (trang cha chạy lại mô phỏng sau một nhịp nghỉ ngắn).
 */
import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_PRICING_RULES, floorTo, roundTo } from "@/lib/pricing/rules";
import type { PricingRules } from "@/lib/pricing/types";
import {
  DEFAULT_WHAT_IF, DEMAND_SHAPES, DEMAND_SHAPE_LABEL_VI, RULE_LIMITS,
  type DailyDemandConfig, type DemandShape,
} from "@/lib/pricing-copilot/what-if-simulator";
import { skipGroupSeparator } from "./number-input";
import { pct, vnd } from "./formula-panel";
import s from "./demo.module.css";

export interface Setup {
  capacity: number;
  phaseDays: number;
  floor: number;
  base: number;
  ceiling: number;
  dailyDemand: number;
  shape: DemandShape;
  showAfterPhaseHours: number;
  elasticity: number;
  runs: number;
  rules: PricingRules;
}

export const DEFAULT_SETUP: Setup = {
  capacity: DEFAULT_WHAT_IF.capacity,
  phaseDays: DEFAULT_WHAT_IF.phaseDays,
  ...DEFAULT_WHAT_IF.bounds,
  dailyDemand: 150,
  shape: "even",
  showAfterPhaseHours: DEFAULT_WHAT_IF.showAfterPhaseHours,
  elasticity: DEFAULT_WHAT_IF.elasticity,
  runs: DEFAULT_WHAT_IF.runs,
  rules: { ...DEFAULT_PRICING_RULES, k: DEFAULT_WHAT_IF.k },
};

export function toConfig(x: Setup): DailyDemandConfig {
  return {
    capacity: x.capacity, phaseDays: x.phaseDays, seed: DEFAULT_WHAT_IF.seed,
    bounds: { floor: x.floor, base: x.base, ceiling: x.ceiling },
    dailyDemand: x.dailyDemand, shape: x.shape, showAfterPhaseHours: x.showAfterPhaseHours,
    elasticity: x.elasticity, runs: x.runs, rules: x.rules,
  };
}

export function setupErrors(x: Setup): string[] {
  const e: string[] = [];
  if (!(Number.isInteger(x.capacity) && x.capacity >= 1 && x.capacity <= 50_000)) e.push("Sức chứa phải là số nguyên 1 – 50.000 ghế.");
  if (!(x.phaseDays >= 0.25 && x.phaseDays <= 60)) e.push("Thời gian mở bán phải trong 0,25 – 60 ngày.");
  if ([x.floor, x.base, x.ceiling].some((v) => !(Number.isFinite(v) && v >= 1000 && v <= 2_000_000_000))) e.push("Giá vé phải từ 1.000 đ đến 2 tỷ đ.");
  else if (!(x.floor <= x.base && x.base <= x.ceiling)) e.push("Cần giá sàn ≤ giá cơ bản ≤ giá trần.");
  if (!(x.dailyDemand >= 0 && x.dailyDemand <= 50_000)) e.push("Số vé dự kiến mỗi ngày phải trong 0 – 50.000.");
  if (!(x.elasticity >= 0 && x.elasticity <= 5)) e.push("Độ nhạy giá ε phải trong 0 – 5.");
  if (!(Number.isInteger(x.runs) && x.runs >= 20 && x.runs <= 1000)) e.push("Số lần chạy phải trong 20 – 1.000.");
  for (const [key, [lo, hi]] of Object.entries(RULE_LIMITS) as [keyof PricingRules, [number, number]][]) {
    const v = x.rules[key];
    if (!(Number.isFinite(v) && v >= lo && v <= hi)) e.push(`Tham số "${RULE_FIELDS.find((f) => f.key === key)?.label ?? key}" ngoài miền cho phép.`);
  }
  return e;
}

// ---------- ô nhập số kiểu Việt Nam (1.600.000 / 12,5) ----------

const fmt = (v: number, d: number) => Number.isFinite(v) ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d }).format(v) : "";
function parse(text: string) {
  const t = text.trim().replaceAll(".", "").replace(",", ".");
  return t === "" || t === "-" ? NaN : Number(t);
}

export function NumField({ label, value, onChange, unit, digits = 0, hint, id, invalid }: {
  label: ReactNode; value: number; onChange: (v: number) => void; unit?: string; digits?: number; hint?: ReactNode; id?: string; invalid?: boolean;
}) {
  const [text, setText] = useState(fmt(value, digits));
  useEffect(() => {
    // đồng bộ khi giá trị đổi từ nơi khác (vd. chuyển giữa số tiền và %)
    if (parse(text) !== value && !(Number.isNaN(parse(text)) && Number.isNaN(value))) setText(fmt(value, digits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, digits]);
  return (
    <label className={invalid ? s.invalid : undefined}>
      {label}
      <span className={s.unit}>
        <input id={id} type="text" inputMode={digits ? "decimal" : "numeric"} value={text} aria-invalid={invalid || undefined}
          onKeyDown={skipGroupSeparator}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,-]/g, "");
            const [int, frac] = raw.replaceAll(".", "").split(",");
            const neg = int.startsWith("-");
            const digitsOnly = int.replace("-", "");
            const grouped = digitsOnly ? new Intl.NumberFormat("vi-VN").format(Number(digitsOnly)) : "";
            const next = (neg ? "-" : "") + grouped + (frac !== undefined && digits ? "," + frac.slice(0, digits) : "");
            setText(next);
            onChange(parse(next));
          }}
          onBlur={() => Number.isFinite(value) && setText(fmt(value, digits))} />
        {unit && <i>{unit}</i>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

// ---------- tham số thuật toán ----------

type RuleField = { key: keyof PricingRules; label: string; sym: string; unit: "%" | "giờ" | "vé" | "×"; digits?: number; hint?: string; negate?: boolean };
export const RULE_FIELDS: RuleField[] = [
  { key: "k", sym: "k", label: "Tỷ lệ bán kỳ vọng cuối đợt", unit: "%", hint: "E chạy tuyến tính từ 0 tới k" },
  { key: "deadZone", sym: "δ", label: "Vùng chết", unit: "%", digits: 1, hint: "|D| ≤ δ thì không đổi giá" },
  { key: "demandUpMax", sym: "a⁺max", label: "a_cầu tăng tối đa", unit: "%", digits: 1 },
  { key: "demandDownMax", sym: "a⁻max", label: "a_cầu giảm tối đa", unit: "%", digits: 1 },
  { key: "demandDownSlope", sym: "s", label: "Độ dốc khi bán chậm", unit: "×", digits: 2 },
  { key: "minSoldAbs", sym: "Smin", label: "Số vé tối thiểu để tăng giá", unit: "vé" },
  { key: "totalAdjCap", sym: "mmax", label: "Trần tổng hệ số |m|", unit: "%", digits: 1, hint: "u = m ÷ mmax quyết định dùng bao nhiêu phần biên giá" },
  { key: "lastMinuteHours", sym: "hchót", label: "Cửa sổ giờ chót", unit: "giờ" },
  { key: "lastMinuteOccupancy", sym: "Ochót", label: "Ngưỡng lấp đầy giờ chót", unit: "%" },
  { key: "lastMinuteAdj", sym: "a_giờ_chót", label: "Mức giảm giờ chót", unit: "%", digits: 1, negate: true },
  { key: "stepRatio", sym: "bước", label: "Bước tối đa mỗi 15 phút", unit: "%", digits: 1, hint: "tính theo giá cơ bản B" },
  { key: "dailyCapRatio", sym: "24h", label: "Biên trượt 24 giờ", unit: "%", digits: 1, hint: "|P − P24| ≤ tỷ lệ × B" },
  { key: "minChangeRatio", sym: "Δmin", label: "Ngưỡng đổi tối thiểu", unit: "%", digits: 1, hint: "chênh dưới ngưỡng thì giữ giá" },
];

const toView = (f: RuleField, v: number) => (f.unit === "%" ? v * 100 : v) * (f.negate ? -1 : 1);
const fromView = (f: RuleField, v: number) => (f.unit === "%" ? v / 100 : v) * (f.negate ? -1 : 1);

// ---------- khung giá ----------

const PRESETS = [
  { label: "Hẹp", floor: 0.1, ceiling: 0.2, hint: "−10% / +20%" },
  { label: "Vừa", floor: 0.2, ceiling: 0.5, hint: "−20% / +50%" },
  { label: "Rộng", floor: 0.3, ceiling: 1, hint: "−30% / +100%" },
];

function duration(minutes: number) {
  if (minutes < 60) return `${fmt(minutes, 0)} phút`;
  if (minutes < 1440) return `${fmt(minutes / 60, 1)} giờ`;
  return `${fmt(minutes / 1440, 1)} ngày`;
}

/** Bảng tra P′ theo u và các giới hạn suy ra từ khung giá — "giá sẽ chạy thế nào" trước khi mô phỏng. */
function PriceLadder({ x }: { x: Setup }) {
  const { floor: F, base: B, ceiling: Ce, rules: r } = x;
  if (!(F > 0 && F <= B && B <= Ce)) return null;
  const step = floorTo(r.stepRatio * B, r.roundTo);
  const minChange = floorTo(r.minChangeRatio * B, r.roundTo);
  const cap24 = floorTo(r.dailyCapRatio * B, r.roundTo);
  const target = (u: number) => Math.min(Ce, Math.max(F, roundTo(u >= 0 ? B + u * (Ce - B) : B + u * (B - F), r.roundTo)));
  const steps = [-1, -0.5, 0, 0.5, 1];
  const span = Ce - F || 1;
  const toCeilCycles = step > 0 ? Math.ceil((Ce - B) / step) : Infinity;
  const toCeilDays = cap24 > 0 ? Math.max(0, Math.ceil((Ce - B) / cap24) - 1) : Infinity;
  const warnings: string[] = [];
  if (Ce - B < minChange && Ce > B) warnings.push(`Trần chỉ cao hơn giá cơ bản ${vnd(Ce - B)} < ngưỡng đổi ${vnd(minChange)}: giá gần như không thể tăng.`);
  if (Ce === B) warnings.push("Giá trần bằng giá cơ bản: giá động chỉ có thể giảm.");
  if (F === B) warnings.push("Giá sàn bằng giá cơ bản: giá động chỉ có thể tăng.");
  if (B - F > 0 && B - F < minChange) warnings.push(`Sàn chỉ thấp hơn giá cơ bản ${vnd(B - F)} < ngưỡng đổi: giá gần như không thể giảm.`);
  if (Ce > 2 * B) warnings.push("Trần hơn gấp đôi giá cơ bản: khi cầu tăng mạnh, giá có thể lên rất cao — cân nhắc trải nghiệm khán giả.");
  if (step < minChange) warnings.push("Bước tối đa nhỏ hơn ngưỡng đổi tối thiểu: giá sẽ không bao giờ đổi.");
  return (
    <div className={s.ladder}>
      <div className={s.ladderTrack} aria-hidden="true">
        {steps.map((u) => {
          const p = target(u);
          return <span key={u} className={u === 0 ? s.ladderBase : ""} style={{ left: `${(100 * (p - F)) / span}%` }} title={vnd(p)} />;
        })}
      </div>
      <table className={s.ladderTable} aria-label="Giá mục tiêu theo u">
        <thead><tr><th>u</th>{steps.map((u) => <th key={u}>{u > 0 ? "+" : ""}{fmt(u, 1)}</th>)}</tr></thead>
        <tbody>
          <tr><th>m</th>{steps.map((u) => <td key={u}>{u > 0 ? "+" : ""}{pct(u * r.totalAdjCap, 0)}</td>)}</tr>
          <tr><th>P′</th>{steps.map((u) => <td key={u}>{fmt(target(u) / 1e6, 2)}tr</td>)}</tr>
        </tbody>
      </table>
      <ul className={s.ladderFacts}>
        <li><b>{vnd(step)}</b> bước tối đa mỗi 15 phút</li>
        <li><b>{vnd(minChange)}</b> chênh tối thiểu để đổi giá</li>
        <li><b>±{vnd(cap24)}</b> biên so với giá 24 giờ trước</li>
        <li>Từ B lên trần: nhanh nhất <b>{Number.isFinite(toCeilCycles) ? duration(toCeilCycles * 15) : "—"}</b>
          {Number.isFinite(toCeilDays) && toCeilDays > 0 && <> nếu không vướng biên 24 giờ; thực tế ≥ <b>{fmt(toCeilDays, 0)} ngày</b></>}</li>
      </ul>
      {warnings.map((w) => <p key={w} className={s.warn}>{w}</p>)}
    </div>
  );
}

function Section({ title, children, open = true, aside }: { title: string; children: ReactNode; open?: boolean; aside?: ReactNode }) {
  return (
    <details className={s.section} open={open}>
      <summary>{title}{aside}</summary>
      <div className={s.sectionBody}>{children}</div>
    </details>
  );
}

const SHOW_GAPS = [
  [240, "10 ngày sau khi đóng bán"],
  [72, "3 ngày sau khi đóng bán"],
  [24, "Ngay hôm sau khi đóng bán"],
  [0, "Ngay khi đóng bán"],
] as const;

export function ConfigForm({ value, onChange }: { value: Setup; onChange: (next: Setup) => void }) {
  const x = value;
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const set = (patch: Partial<Setup>) => onChange({ ...x, ...patch });
  const setRule = (key: keyof PricingRules, v: number) => onChange({ ...x, rules: { ...x.rules, [key]: v } });
  const errors = setupErrors(x);
  const changedRules = RULE_FIELDS.filter((f) => x.rules[f.key] !== DEFAULT_SETUP.rules[f.key]).length
    + (x.elasticity !== DEFAULT_SETUP.elasticity ? 1 : 0) + (x.runs !== DEFAULT_SETUP.runs ? 1 : 0);
  const floorPct = x.base > 0 ? (x.base - x.floor) / x.base : NaN;
  const ceilPct = x.base > 0 ? (x.ceiling - x.base) / x.base : NaN;

  function setBase(base: number) {
    if (mode === "percent" && Number.isFinite(base) && Number.isFinite(floorPct) && Number.isFinite(ceilPct)) {
      set({ base, floor: roundTo(base * (1 - floorPct), 1000), ceiling: roundTo(base * (1 + ceilPct), 1000) });
    } else set({ base });
  }

  return (
    <div className={s.settings}>
      <div className={s.settingsHead}>
        <h2>Thiết lập</h2>
        <button type="button" className={s.linkBtn} onClick={() => onChange(DEFAULT_SETUP)}>Khôi phục mặc định</button>
      </div>

      <Section title="Đợt bán vé">
        <div className={s.pair}>
          <NumField label="Sức chứa" unit="ghế" value={x.capacity} onChange={(capacity) => set({ capacity })} invalid={(!(x.capacity >= 1 && x.capacity <= 50_000))} />
          <NumField label="Mở bán trong" unit="ngày" digits={2} value={x.phaseDays} onChange={(phaseDays) => set({ phaseDays })} invalid={(!(x.phaseDays >= 0.25 && x.phaseDays <= 60))} />
        </div>
        <label>Đêm diễn diễn ra
          <select value={x.showAfterPhaseHours} onChange={(e) => set({ showAfterPhaseHours: Number(e.target.value) })}>
            {SHOW_GAPS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
          </select>
          <small>Còn ≤ {fmt(x.rules.lastMinuteHours, 0)} giờ tới đêm diễn mà bán chưa tới {pct(x.rules.lastMinuteOccupancy, 0)} thì kích hoạt giảm giá giờ chót.</small>
        </label>
      </Section>

      <Section title="Khung giá vé" aside={<span className={s.sumHint}>{fmt(x.floor / 1e6, 2)} – {fmt(x.ceiling / 1e6, 2)} tr</span>}>
        <div className={s.segment} role="group" aria-label="Cách nhập giá sàn và giá trần">
          <button type="button" aria-pressed={mode === "amount"} onClick={() => setMode("amount")}>Số tiền</button>
          <button type="button" aria-pressed={mode === "percent"} onClick={() => setMode("percent")}>% theo giá cơ bản</button>
        </div>
        <NumField label="Giá cơ bản (B)" unit="₫" value={x.base} onChange={setBase} invalid={(!(x.floor <= x.base && x.base <= x.ceiling))} />
        {mode === "amount" ? (
          <div className={s.pair}>
            <NumField label="Giá sàn (F)" unit="₫" value={x.floor} onChange={(floor) => set({ floor })} invalid={(!(x.floor <= x.base))}
              hint={Number.isFinite(floorPct) ? `−${pct(floorPct)} so với B` : undefined} />
            <NumField label="Giá trần (Ce)" unit="₫" value={x.ceiling} onChange={(ceiling) => set({ ceiling })} invalid={(!(x.base <= x.ceiling))}
              hint={Number.isFinite(ceilPct) ? `+${pct(ceilPct)} so với B` : undefined} />
          </div>
        ) : (
          <div className={s.pair}>
            <NumField label="Sàn thấp hơn B" unit="%" digits={1} value={floorPct * 100}
              onChange={(v) => set({ floor: roundTo(x.base * (1 - v / 100), 1000) })} hint={`F = ${vnd(x.floor)}`} invalid={(!(floorPct >= 0 && floorPct < 1))} />
            <NumField label="Trần cao hơn B" unit="%" digits={1} value={ceilPct * 100}
              onChange={(v) => set({ ceiling: roundTo(x.base * (1 + v / 100), 1000) })} hint={`Ce = ${vnd(x.ceiling)}`} invalid={(!(ceilPct >= 0))} />
          </div>
        )}
        <div className={s.presets}>
          <span>Mẫu nhanh:</span>
          {PRESETS.map((p) => {
            const on = Math.abs(floorPct - p.floor) < 1e-3 && Math.abs(ceilPct - p.ceiling) < 1e-3;
            return (
              <button key={p.label} type="button" aria-pressed={on} title={p.hint}
                onClick={() => set({ floor: roundTo(x.base * (1 - p.floor), 1000), ceiling: roundTo(x.base * (1 + p.ceiling), 1000) })}>
                {p.label} <small>{p.hint}</small>
              </button>
            );
          })}
        </div>
        <PriceLadder x={x} />
      </Section>

      <Section title="Nhu cầu mua vé">
        <NumField label="Số vé dự kiến bán mỗi ngày" unit="vé/ngày" digits={1} value={x.dailyDemand} onChange={(dailyDemand) => set({ dailyDemand })}
          invalid={(!(x.dailyDemand >= 0))}
          hint={<>Tổng cầu cả đợt ≈ <b>{fmt(x.dailyDemand * x.phaseDays, 0)}</b> vé = <b>{pct((x.dailyDemand * x.phaseDays) / Math.max(1, x.capacity), 0)}</b> sức chứa (ở giá B).</>} />
        <label>Diễn biến nhu cầu
          <select value={x.shape} onChange={(e) => set({ shape: e.target.value as DemandShape })}>
            {DEMAND_SHAPES.map((sh) => <option key={sh} value={sh}>{DEMAND_SHAPE_LABEL_VI[sh]}</option>)}
          </select>
          <small>Tổng cầu không đổi, chỉ khác thời điểm khách đổ về.</small>
        </label>
      </Section>

      <Section title="Tham số thuật toán" open={false}
        aside={changedRules ? <span className={s.sumBadge}>{changedRules} đã đổi</span> : <span className={s.sumHint}>mặc định</span>}>
        <p className={s.note}>Ký hiệu khớp với bảng công thức trong tab Diễn biến giá. Trên hệ thống thật các giá trị này là hằng số trong <code>lib/pricing/rules.ts</code>.</p>
        <div className={s.ruleGrid}>
          {RULE_FIELDS.map((f) => {
            const [lo, hi] = RULE_LIMITS[f.key];
            const v = x.rules[f.key];
            return (
              <NumField key={f.key} digits={f.digits ?? 0} unit={f.unit} value={toView(f, v)} onChange={(nv) => setRule(f.key, fromView(f, nv))}
                invalid={!(v >= lo && v <= hi)}
                label={<span className={s.ruleLabel}><em>{f.sym}</em>{f.label}{v !== DEFAULT_SETUP.rules[f.key] && <b title="Đã đổi so với mặc định">•</b>}</span>}
                hint={f.hint} />
            );
          })}
          <NumField digits={2} unit="ε" value={x.elasticity} onChange={(elasticity) => set({ elasticity })} invalid={!(x.elasticity >= 0 && x.elasticity <= 5)}
            label={<span className={s.ruleLabel}><em>ε</em>Độ nhạy giá của khách</span>} hint="Giá cao hơn B 10% → khách giảm ≈ ε × 10%" />
          <NumField unit="lần" value={x.runs} onChange={(runs) => set({ runs })} invalid={!(x.runs >= 20 && x.runs <= 1000)}
            label={<span className={s.ruleLabel}><em>N</em>Số lần chạy so sánh</span>} hint="Nhiều hơn → trung bình ổn định hơn, chạy lâu hơn" />
        </div>
      </Section>

      {errors.length > 0 && <div role="alert" className={s.errorBox}>{errors.map((e) => <p key={e}>{e}</p>)}</div>}
    </div>
  );
}
