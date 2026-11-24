/**
 * Bảng công thức từng bước tại một thời điểm của mô phỏng: mỗi biểu thức hiện
 * ký hiệu → thay số → kết quả, nhánh đang áp dụng được tô đậm. Các số trung gian
 * tính lại bằng đúng các hàm của lib/pricing nên luôn khớp với giá mô phỏng.
 */
import { clamp, floorTo, roundTo } from "@/lib/pricing/rules";
import type { PricingRules } from "@/lib/pricing/types";
import type { DailyDemandConfig, SimulationPoint } from "@/lib/pricing-copilot/what-if-simulator";
import s from "./demo.module.css";

const nf = (d = 1) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const vnd = (v: number) => nf(0).format(Math.round(v)) + " đ";
export const pct = (r: number, d = 1) => nf(d).format(r * 100) + "%";
export const spct = (r: number, d = 1) => (r > 0 ? "+" : r < 0 ? "−" : "±") + nf(d).format(Math.abs(r) * 100) + "%";
const svnd = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + nf(0).format(Math.abs(Math.round(v))) + " đ";
const n = (v: number, d = 2) => nf(d).format(v);

type State = "on" | "off" | "hit" | undefined;
interface Row { sym: string; name: string; formula: string; calc?: string; value: string; state?: State; note?: string }

function Group({ title, rows, aside }: { title: string; rows: Row[]; aside?: string }) {
  return (
    <section className={s.fGroup}>
      <header><h4>{title}</h4>{aside && <span>{aside}</span>}</header>
      <div className={s.fRows}>
        {rows.map((r, i) => (
          <div key={i} className={`${s.fRow} ${r.state === "on" ? s.fOn : r.state === "off" ? s.fOff : r.state === "hit" ? s.fHit : ""}`}>
            <span className={s.fSym}>{r.sym}</span>
            <span className={s.fName}>{r.name}{r.note && <small>{r.note}</small>}</span>
            <code className={s.fExpr}>{r.formula}{r.calc && <><br /><b>= {r.calc}</b></>}</code>
            <strong className={s.fVal}>{r.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FormulaPanel({ point, config, rules, phaseTicks: T, elasticity, timeLabel }: {
  point: SimulationPoint; config: DailyDemandConfig; rules: PricingRules; phaseTicks: number; elasticity: number; timeLabel: string;
}) {
  const d = point.decision;
  const { floor: F, base: B, ceiling: Ce } = config.bounds;
  const C = config.capacity;
  const S = point.soldAtQuote;
  const r = rules;
  if (!d) {
    return (
      <section className={s.formula} aria-label="Công thức tính giá">
        <div className={s.fHead}><h3>Công thức tại {timeLabel}</h3></div>
        <p className={s.sub}>Đợt bán đã kết thúc ({n(point.sold, 0)}/{n(C, 0)} vé). Không còn lần tính giá nào sau thời điểm này.</p>
      </section>
    );
  }

  // 1. Nhu cầu
  const O = d.occupancy;
  const E = d.expected;
  const D = d.deviation;
  const minSold = Math.max(r.minSoldAbs, r.minSoldRatio * C);
  const enough = S >= minSold;
  const upActive = D > r.deadZone;
  const deadActive = !upActive && D >= -r.deadZone;
  const downActive = D < -r.deadZone;

  // 2. Hệ số
  const a = d.adjustments;
  const sum = a.demand + a.lastMinute + a.hold;
  const lastMinuteTime = point.hoursToShow <= r.lastMinuteHours;
  const lastMinuteLow = O < r.lastMinuteOccupancy;

  // 3. Giá mục tiêu
  const up = d.u >= 0;
  const raw = up ? B + d.u * (Ce - B) : B + d.u * (B - F);
  const rounded = roundTo(raw, r.roundTo);

  // 4. Giới hạn (cùng số học với applyChangeLimits)
  const P0 = point.previousPrice;
  const P24 = point.price24hAgo;
  const minChange = floorTo(r.minChangeRatio * B, r.roundTo);
  const step = floorTo(r.stepRatio * B, r.roundTo);
  const cap24 = floorTo(r.dailyCapRatio * B, r.roundTo);
  const diff = d.target - P0;
  const lim = new Set(d.limitedBy);
  const afterStep = diff === 0 ? P0 : P0 + Math.sign(diff) * Math.min(Math.abs(diff), step);
  const skipped = diff === 0 || Math.abs(diff) < minChange; // dừng ngay ở ngưỡng đổi tối thiểu
  const lo = Math.min(P0, P24 - cap24);
  const hi = Math.max(P0, P24 + cap24);

  // 5. Khách
  const perTick = config.dailyDemand / 4 / 24;

  return (
    <section className={s.formula} aria-label="Công thức tính giá">
      <div className={s.fHead}>
        <h3>Công thức tại {timeLabel}</h3>
        <span className={d.changed ? (d.newPrice > P0 ? s.badgeUp : s.badgeDown) : s.badge}>
          {d.changed ? `${vnd(P0)} → ${vnd(d.newPrice)} (${svnd(d.newPrice - P0)})` : `Giữ nguyên ${vnd(P0)}`}
        </span>
      </div>

      <Group title="① Đo nhu cầu" aside={`chu kỳ ${n(point.tick, 0)}/${n(T, 0)} · mỗi chu kỳ 15 phút`} rows={[
        { sym: "O", name: "Tỷ lệ lấp đầy", formula: "S ÷ C", calc: `${n(S, 0)} ÷ ${n(C, 0)}`, value: pct(O) },
        { sym: "p", name: "Tiến độ đợt", formula: "t ÷ T", calc: `${n(point.tick, 0)} ÷ ${n(T, 0)}`, value: pct(point.progress) },
        { sym: "E", name: "Kỳ vọng đã bán", formula: "K₀ + (K₁ − K₀) × p   (K₀ = 0, K₁ = k)", calc: `${n(r.k)} × ${n(point.progress, 3)}`, value: pct(E) },
        { sym: "D", name: "Độ lệch tiến độ", formula: "O − E", calc: `${pct(O)} − ${pct(E)}`, value: spct(D),
          state: D > r.deadZone ? "hit" : undefined },
      ]} />

      <Group title="② Hệ số điều chỉnh" aside={`vùng chết δ = ±${pct(r.deadZone)}`} rows={[
        { sym: "a_cầu", name: "Bán nhanh", note: `D > δ và S ≥ max(${n(r.minSoldAbs, 0)}; ${pct(r.minSoldRatio)}·C) = ${n(Math.ceil(minSold), 0)} vé${upActive && !enough ? " — chưa đủ vé nên = 0" : ""}`,
          formula: `min(${pct(r.demandUpMax)}; D − δ)`, calc: upActive ? `min(${pct(r.demandUpMax)}; ${spct(D)} − ${pct(r.deadZone)})` : undefined,
          value: upActive ? spct(a.demand) : "—", state: upActive ? "on" : "off" },
        { sym: "a_cầu", name: "Vùng chết", note: "|D| ≤ δ → không phản ứng với dao động nhỏ", formula: "0",
          value: deadActive ? spct(0) : "—", state: deadActive ? "on" : "off" },
        { sym: "a_cầu", name: "Bán chậm", note: "D < −δ", formula: `max(−${pct(r.demandDownMax)}; (D + δ) × ${n(r.demandDownSlope)})`,
          calc: downActive ? `max(−${pct(r.demandDownMax)}; (${spct(D)} + ${pct(r.deadZone)}) × ${n(r.demandDownSlope)})` : undefined,
          value: downActive ? spct(a.demand) : "—", state: downActive ? "on" : "off" },
        { sym: "a_giờ_chót", name: "Giảm giờ chót", note: `còn ${n(point.hoursToShow, 1)} giờ ${lastMinuteTime ? "≤" : ">"} ${n(r.lastMinuteHours, 0)} giờ · O ${lastMinuteLow ? "<" : "≥"} ${pct(r.lastMinuteOccupancy, 0)}`,
          formula: `${spct(r.lastMinuteAdj)} nếu cả hai điều kiện đúng`, value: spct(a.lastMinute), state: a.lastMinute ? "on" : "off" },
        { sym: "a_giữ", name: "Ghế đang giữ", note: "mô phỏng không có giữ ghế (H = 0)", formula: `${spct(r.holdAdj)} nếu H ≥ max(${n(r.holdMinAbs, 0)}; ${pct(r.holdRatio, 0)}·(C − S))`,
          value: spct(a.hold), state: "off" },
        { sym: "m", name: "Tổng hệ số (kẹp)", formula: `clamp(a_cầu + a_giờ_chót + a_giữ; −${pct(r.totalAdjCap, 0)}; +${pct(r.totalAdjCap, 0)})`,
          calc: `clamp(${spct(sum)})`, value: spct(d.m), state: d.m !== sum ? "hit" : undefined },
        { sym: "u", name: "Mức dùng biên giá", formula: `m ÷ ${pct(r.totalAdjCap, 0)}  ∈ [−1; 1]`, calc: `${spct(d.m)} ÷ ${pct(r.totalAdjCap, 0)}`, value: n(d.u, 3) },
      ]} />

      <Group title="③ Giá mục tiêu P′" aside={`F ${vnd(F)} · B ${vnd(B)} · Ce ${vnd(Ce)}`} rows={[
        up
          ? { sym: "P′", name: "u ≥ 0: tiến về trần", formula: "B + u × (Ce − B)", calc: `${vnd(B)} + ${n(d.u, 3)} × ${vnd(Ce - B)} = ${vnd(raw)}`, value: vnd(raw), state: "on" }
          : { sym: "P′", name: "u < 0: lùi về sàn", formula: "B + u × (B − F)", calc: `${vnd(B)} − ${n(-d.u, 3)} × ${vnd(B - F)} = ${vnd(raw)}`, value: vnd(raw), state: "on" },
        { sym: "P′", name: "Làm tròn & kẹp biên", formula: `clamp(round_${n(r.roundTo, 0)}(P′); F; Ce)`, calc: `clamp(${vnd(rounded)}; ${vnd(F)}; ${vnd(Ce)})`, value: vnd(d.target) },
      ]} />

      <Group title="④ Giới hạn thay đổi" aside={`P0 ${vnd(P0)} · P24 ${vnd(P24)}`} rows={[
        { sym: "Δ", name: "Khoảng cần đi", formula: "P′ − P0", calc: `${vnd(d.target)} − ${vnd(P0)}`, value: svnd(diff) },
        { sym: "Δmin", name: "Ngưỡng đổi tối thiểu", note: lim.has("deadband") ? "chênh lệch quá nhỏ → giữ giá" : "đủ lớn để đổi",
          formula: `|Δ| < ${pct(r.minChangeRatio)} × B = ${vnd(minChange)} → giữ P0`, value: diff === 0 ? "Không đổi" : lim.has("deadband") ? "Giữ giá" : "Qua", state: lim.has("deadband") ? "hit" : undefined },
        { sym: "bước", name: "Bước tối đa mỗi chu kỳ", note: lim.has("step10") ? "bị cắt còn một bước" : "trong giới hạn",
          formula: `P0 + sign(Δ) × min(|Δ|; ${pct(r.stepRatio)} × B = ${vnd(step)})`, calc: diff ? `${vnd(P0)} ${diff > 0 ? "+" : "−"} ${vnd(Math.min(Math.abs(diff), step))}` : undefined,
          value: skipped ? "—" : vnd(afterStep), state: skipped ? "off" : lim.has("step10") ? "hit" : undefined },
        { sym: "24h", name: "Biên trượt 24 giờ", note: lim.has("cap24h") ? "chạm biên 24 giờ" : "trong biên",
          formula: `[P24 − ${pct(r.dailyCapRatio, 0)}·B; P24 + ${pct(r.dailyCapRatio, 0)}·B]`, calc: `[${vnd(lo)}; ${vnd(hi)}]`,
          value: skipped ? "—" : vnd(clamp(afterStep, lo, hi)), state: skipped ? "off" : lim.has("cap24h") ? "hit" : undefined },
        { sym: "P", name: "Giá mới (trong [F; Ce])", formula: "clamp(P; F; Ce)", value: vnd(d.newPrice), state: "on" },
      ]} />

      <Group title="⑤ Phản ứng của khách trong 15 phút tới" aside={`độ nhạy giá ε = ${n(elasticity)}`} rows={[
        { sym: "λ", name: "Số khách kỳ vọng", note: "cầu của chu kỳ × w(x) theo diễn biến nhu cầu",
          formula: "λ₀ × w(x) × (B ÷ P)^ε", calc: `${n(perTick, 2)} × w × (${vnd(B)} ÷ ${vnd(d.newPrice)})^${n(elasticity)}`,
          value: n(point.lambda, 2) + " khách" },
        { sym: "n", name: "Vé bán thực tế", note: "ngẫu nhiên Poisson(λ), không vượt số ghế còn", formula: "min(Poisson(λ); C − S)", value: "→ chu kỳ sau" },
      ]} />
    </section>
  );
}
