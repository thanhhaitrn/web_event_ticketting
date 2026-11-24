"use client";

/**
 * Tab "So sánh doanh thu": giá cố định và giá động v1.1 chạy N lần trên CÙNG chuỗi khách ngẫu nhiên.
 * Công thức thay số, bảng chỉ số, doanh thu tích luỹ, phân phối P10–P90 và độ nhạy theo mức cầu.
 */
import type { DailyDemandConfig, PolicyDetail, SensitivityPoint } from "@/lib/pricing-copilot/what-if-simulator";
import { LineChart, RangeChart } from "./chart-kit";
import { pct, spct, vnd } from "./formula-panel";
import { timeAxis } from "./timeline-view";
import s from "./demo.module.css";

const nf = (d: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d });
const big = (v: number) => Math.abs(v) >= 1e9 ? nf(3).format(v / 1e9) + " tỷ" : nf(1).format(v / 1e6) + " tr";
const sbig = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + big(Math.abs(v));
const FIXED = "#8a8e96";
const DYNAMIC = "#5b21c7";

function insight(f: PolicyDetail, d: PolicyDetail, ratio: number) {
  const up = d.revenue / Math.max(1, f.revenue) - 1;
  const priceUp = d.avgTicketPrice / Math.max(1, f.avgTicketPrice) - 1;
  const fillUp = d.fillRate - f.fillRate;
  if (Math.abs(up) < 0.005) return "Hai cách cho doanh thu gần như bằng nhau: cầu không đủ lệch so với kế hoạch để giá động tạo khác biệt.";
  if (up > 0 && priceUp > 0.01 && fillUp > -0.02) {
    return `Cầu ≈ ${pct(ratio, 0)} sức chứa: giá động bán mỗi vé đắt hơn ${spct(priceUp)} trong khi tỷ lệ bán ${Math.abs(fillUp) < 0.005 ? "gần như không đổi" : `chỉ đổi ${nf(1).format(fillUp * 100)} điểm %`}, nên doanh thu cao hơn.`;
  }
  if (up > 0 && fillUp > 0.01) return `Giá động giảm giá khi bán chậm, bán thêm ${pct(fillUp)} sức chứa — đủ bù phần giá thấp hơn.`;
  if (up < 0 && fillUp < 0) {
    return `Cầu ≈ ${pct(ratio, 0)} sức chứa: tăng giá lúc bán nhanh làm mất khách nhạy giá (ε > 1) mà không chắc hết vé, nên giá cố định nhỉnh hơn. Đây là giới hạn đã biết của quy tắc dựa trên tiến độ.`;
  }
  return up > 0 ? "Giá động cho doanh thu cao hơn." : "Giá cố định cho doanh thu cao hơn trong kịch bản này.";
}

export function CompareView({ details, sensitivity, config, runs, elasticity, onPickDemand }: {
  details: { fixed: PolicyDetail; dynamic: PolicyDetail };
  sensitivity: SensitivityPoint[] | null;
  config: DailyDemandConfig; runs: number; elasticity: number;
  onPickDemand: (dailyDemand: number) => void;
}) {
  const { fixed: f, dynamic: d } = details;
  const delta = d.revenue - f.revenue;
  const share = f.revenue > 0 ? delta / f.revenue : 0;
  const even = Math.abs(share) < 0.005;
  const Q = config.dailyDemand * config.phaseDays;
  const ratio = Q / config.capacity;
  const axis = timeAxis(config.phaseDays);
  const T = config.phaseDays * (config.phaseDays <= 2 ? 24 : 1);
  const xsCurve = f.curve.map((_, j) => (T * j) / (f.curve.length - 1));
  const sensIdx = sensitivity ? sensitivity.findIndex((p) => Math.abs(p.ratio - Math.round(ratio * 1000) / 1000) < 1e-9) : -1;
  const oneIdx = sensitivity ? sensitivity.findIndex((p) => p.ratio >= 1) : -1;

  const rows: [string, string, string, string, string?][] = [
    ["Doanh thu trung bình R̄", big(f.revenue), big(d.revenue), `${sbig(delta)} (${spct(share)})`, delta > 0 ? "up" : delta < 0 ? "down" : ""],
    ["Giá bình quân mỗi vé", vnd(f.avgTicketPrice), vnd(d.avgTicketPrice), spct(d.avgTicketPrice / Math.max(1, f.avgTicketPrice) - 1)],
    ["Tỷ lệ vé đã bán", pct(f.fillRate), pct(d.fillRate), `${d.fillRate >= f.fillRate ? "+" : "−"}${nf(1).format(Math.abs(d.fillRate - f.fillRate) * 100)} điểm %`],
    ["Số lần chạy bán hết vé", pct(f.soldOutShare, 0), pct(d.soldOutShare, 0), ""],
    ["Hết vé vào (trung bình)", f.soldOutDay === null ? "không hết" : `ngày ${nf(1).format(f.soldOutDay)}`, d.soldOutDay === null ? "không hết" : `ngày ${nf(1).format(d.soldOutDay)}`, ""],
    ["Doanh thu P10 – P90", `${big(f.p10)} – ${big(f.p90)}`, `${big(d.p10)} – ${big(d.p90)}`, ""],
    ["Số lần đổi giá / ngày", nf(1).format(f.changesPerDay), nf(1).format(d.changesPerDay), ""],
    ["Số lần đảo chiều giá / ngày", nf(1).format(f.reversalsPerDay), nf(1).format(d.reversalsPerDay), ""],
  ];

  return (
    <section className={s.card}>
      <div className={s.sectionHead}>
        <div>
          <h2>So sánh doanh thu</h2>
          <p className={s.sub}>Mỗi cách đặt giá chạy {nf(0).format(runs)} lần trên <b>cùng một chuỗi khách ngẫu nhiên</b>, nên chênh lệch chỉ đến từ cách đặt giá.</p>
        </div>
      </div>

      <div className={`${s.delta} ${even ? "" : delta > 0 ? s.up : s.down}`}>
        <span>Chênh lệch khi dùng giá động</span>
        <strong>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{nf(0).format(Math.abs(Math.round(delta)))} đ</strong>
        <small>{even ? "Gần như bằng nhau" : `${spct(share)} doanh thu`}</small>
        <p>{insight(f, d, ratio)}</p>
      </div>

      <table className={s.table} aria-label="Chỉ số theo cách đặt giá">
        <thead><tr><th scope="col">Chỉ số</th><th scope="col">Giá cố định</th><th scope="col">Giá động</th><th scope="col">Chênh lệch</th></tr></thead>
        <tbody>
          {rows.map(([name, a, b, c, tone]) => (
            <tr key={name}><th scope="row">{name}</th><td>{a}</td><td>{b}</td><td className={tone === "up" ? s.up : tone === "down" ? s.down : ""}>{c}</td></tr>
          ))}
        </tbody>
      </table>

      <section className={s.formula} aria-label="Công thức so sánh doanh thu">
        <div className={s.fHead}><h3>Công thức</h3></div>
        <div className={s.fRows}>
          {[
            { sym: "Q", name: "Tổng cầu ở giá B", f: "vé/ngày × số ngày", c: `${nf(1).format(config.dailyDemand)} × ${nf(2).format(config.phaseDays)} = ${nf(0).format(Q)} vé (${pct(ratio, 0)} sức chứa)` },
            { sym: "λₜ", name: "Khách kỳ vọng mỗi 15 phút", f: "Q × w(xₜ) ÷ T × (B ÷ Pₜ)^ε", c: `ε = ${nf(2).format(elasticity)} · với giá cố định (B ÷ B)^ε = 1 nên λ chỉ theo diễn biến nhu cầu` },
            { sym: "nₜ", name: "Vé bán trong chu kỳ", f: "min(Poisson(λₜ); C − Sₜ)" },
            { sym: "R", name: "Doanh thu một lần chạy", f: "Σₜ Pₜ × nₜ" },
            { sym: "R̄", name: "Doanh thu trung bình", f: `(1 ÷ N) × Σᵢ Rᵢ,  N = ${nf(0).format(runs)}`, c: `cố định ${big(f.revenue)} · động ${big(d.revenue)}` },
            { sym: "ΔR", name: "Chênh lệch", f: "R̄_động − R̄_cố định;  ΔR% = ΔR ÷ R̄_cố định", c: `${sbig(delta)} · ${spct(share)}` },
            { sym: "P̄", name: "Giá bình quân / vé", f: "Σ R ÷ Σ vé bán", c: `cố định ${vnd(f.avgTicketPrice)} · động ${vnd(d.avgTicketPrice)}` },
          ].map((r) => (
            <div key={r.sym} className={s.fRow}>
              <span className={s.fSym}>{r.sym}</span><span className={s.fName}>{r.name}</span>
              <code className={s.fExpr}>{r.f}{r.c && <><br /><b>= {r.c}</b></>}</code><strong className={s.fVal} />
            </div>
          ))}
        </div>
      </section>

      <LineChart title="Doanh thu tích luỹ trung bình" height={230}
        subtitle="Khoảng cách giữa hai đường cho biết giá động thu thêm (hoặc mất) vào giai đoạn nào của đợt bán."
        xs={xsCurve} xFormat={axis.format} xTooltip={(x) => axis.format(x)} yFormat={big}
        yDomain={[0, Math.max(1, ...d.curve, ...f.curve) * 1.06]}
        series={[
          { id: "dyn", label: "Giá động", values: d.curve, color: DYNAMIC, area: true },
          { id: "fix", label: "Giá cố định", values: f.curve, color: FIXED, dash: "6 4", width: 2 },
        ]}
        extraTooltip={(k) => <small className={s.tipNote}>Chênh lệch: {sbig(d.curve[k] - f.curve[k])}</small>} />

      <RangeChart title="Phân phối doanh thu giữa các lần chạy" format={big}
        subtitle="Thanh: 80% số lần chạy (P10 – P90) · vạch đứng: trung vị · chấm tròn: trung bình. Thanh hẹp nghĩa là kết quả ổn định."
        rows={[
          { label: "Giá cố định", color: FIXED, p10: f.p10, p50: f.p50, p90: f.p90, mean: f.revenue },
          { label: "Giá động", color: DYNAMIC, p10: d.p10, p50: d.p50, p90: d.p90, mean: d.revenue },
        ]} />

      {sensitivity ? (
        <LineChart title="Độ nhạy theo mức cầu" height={240}
          subtitle={<>Giữ nguyên mọi thiết lập, chỉ đổi số vé/ngày. Điểm đậm là thiết lập hiện tại — <b>bấm vào biểu đồ để thử mức cầu đó</b>.</>}
          xs={sensitivity.map((p) => p.dailyDemand)} xFormat={(x) => nf(0).format(x)} xTooltip={(x, k) => `${nf(1).format(x)} vé/ngày · cầu ${pct(sensitivity[k].ratio, 0)} sức chứa`}
          yFormat={(v) => spct(v, 0)} cursor={sensIdx >= 0 ? sensIdx : undefined}
          onSelect={(k) => onPickDemand(Math.round(sensitivity[k].dailyDemand * 10) / 10)}
          regions={oneIdx > 0 ? [{ from: sensitivity[oneIdx].dailyDemand, to: sensitivity[sensitivity.length - 1].dailyDemand, label: "Cầu ≥ sức chứa", color: "rgba(20, 128, 74, .07)" }] : []}
          refLines={[{ y: 0, label: "hoà vốn", color: "#8a8e96" }]}
          series={[{ id: "uplift", label: "Chênh lệch doanh thu giá động", values: sensitivity.map((p) => p.uplift), color: DYNAMIC, toggle: false, format: (v) => spct(v) }]}
          extraTooltip={(k) => (
            <small className={s.tipNote}>
              cố định {big(sensitivity[k].fixed)} ({pct(sensitivity[k].fillFixed, 0)} lấp đầy) · động {big(sensitivity[k].dynamic)} ({pct(sensitivity[k].fillDynamic, 0)})
            </small>
          )} />
      ) : (
        <p className={s.status} role="status"><span className={s.spinner} aria-hidden="true" />Đang tính độ nhạy theo mức cầu…</p>
      )}
    </section>
  );
}
