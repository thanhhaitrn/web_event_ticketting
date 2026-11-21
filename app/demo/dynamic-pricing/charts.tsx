import type { DemoConfig, PolicyResult, SimulationPoint } from "@/lib/pricing-copilot/what-if-simulator";
import { DEFAULT_PRICING_RULES } from "@/lib/pricing/rules";
import s from "./demo.module.css";

const numbers = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
export const number = (value: number) => numbers.format(value);
export const money = (value: number) => number(Math.round(value)) + " ₫";
export const percent = (ratio: number) => number(ratio * 100) + "%";

export function timeLabel(tick: number, last: number) {
  if (tick === last) return "Kết thúc đợt bán";
  const minutes = tick * 15;
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `Ngày ${1 + Math.floor(minutes / 1440)} · ${hh}:${mm}`;
}

export function explain(p: SimulationPoint, capacity: number) {
  const d = p.decision;
  if (!d) return "Đợt bán đã kết thúc. Biểu đồ ghi nhận giá của chu kỳ cuối cùng.";
  const rules = DEFAULT_PRICING_RULES;
  const reason = d.adjustments.demand > 0 ? "Tốc độ bán vượt kỳ vọng."
    : d.adjustments.demand < 0 ? "Tốc độ bán thấp hơn kỳ vọng."
    : d.deviation > rules.deadZone ? "Số vé đã bán chưa đủ để tăng giá theo nhu cầu."
    : "Tốc độ bán nằm trong vùng ổn định.";
  const movement = d.changed ? `Giá ${p.price > p.previousPrice ? "tăng" : "giảm"} từ ${money(p.previousPrice)} lên ${money(p.price)}.`
    : `Giá giữ ở ${money(p.price)}.`;
  const limits: Record<string, string> = {
    step10: `Mỗi chu kỳ chỉ được điều chỉnh tối đa ${percent(rules.stepRatio)} giá cơ bản.`,
    cap24h: `Giá đã chạm biên thay đổi 24 giờ (${percent(rules.dailyCapRatio)} giá cơ bản).`,
    deadband: `Mức điều chỉnh còn lại dưới ngưỡng ${percent(rules.minChangeRatio)} giá cơ bản.`,
    bounds: "Giá được giới hạn trong khung sàn và trần.",
  };
  return [
    `Khi xét giá, đã bán ${number(p.soldAtQuote)}/${number(capacity)} vé (${percent(d.occupancy)}), kỳ vọng ${percent(d.expected)}.`,
    reason, d.adjustments.lastMinute ? "Sắp tới giờ diễn và tỷ lệ bán còn thấp." : "",
    movement, ...d.limitedBy.map((limit) => limits[limit]),
    !d.changed && d.target === p.price ? "Giá hiện tại đã bằng giá mục tiêu." : "",
  ].filter(Boolean).join(" ");
}

export function TimelineChart({ kind, points, index, config, select }: {
  kind: "price" | "sold"; points: SimulationPoint[]; index: number; config: DemoConfig; select: (n: number) => void;
}) {
  const price = kind === "price";
  const last = points.length - 1;
  const top = price ? config.bounds.ceiling : 1;
  const bottom = price ? config.bounds.floor : 0;
  const x = (t: number) => 1000 * t / last;
  const y = (v: number) => top === bottom ? 50 : 94 - 88 * (v - bottom) / (top - bottom);
  const value = (p: SimulationPoint) => price ? p.price : p.sold / config.capacity;
  const ref = (p: SimulationPoint) => price ? config.bounds.base : p.expected;
  const title = price ? "Giá vé theo thời gian" : "Tiến độ bán vé";
  const path = points.map((p, i) => i ? `H${x(i).toFixed(2)}V${y(value(p)).toFixed(2)}` : `M0,${y(value(p))}`).join(" ");
  return <figure className={s.figure}>
    <figcaption><h3>{title}</h3><span className={s.legend}><i />{price ? "Giá động" : "Đã bán"} <i className={s.dash} />{price ? "Giá cơ bản" : "Kỳ vọng"}</span></figcaption>
    <div className={s.plot}>
      <div className={s.axis}><span>{price ? number(top / 1000000) + " tr" : "100%"}</span><span>{price ? number(bottom / 1000000) + " tr" : "0%"}</span></div>
      <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={title}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          select(Math.max(0, Math.min(last, Math.round((e.clientX - box.left) / box.width * last))));
        }}>
        {[6, 50, 94].map(v => <line key={v} x1="0" x2="1000" y1={v} y2={v} className={s.gridLine} />)}
        <path d={path + " V100 H0 Z"} className={s.fill} />
        <path d={`M0,${y(ref(points[0]))} L1000,${y(ref(points[last]))}`} className={s.reference} />
        <path d={path} className={s.line} />
        <line x1={x(index)} x2={x(index)} y1="0" y2="100" className={s.cursor} />
      </svg>
    </div>
    <div className={s.xaxis}><span>Mở bán</span><span>{number(config.phaseDays / 2)} ngày</span><span>{config.phaseDays} ngày</span></div>
  </figure>;
}

export function Comparison({ rows }: { rows: PolicyResult[] }) {
  const fixedRows = rows.filter((r) => r.policy === "fixed");
  const maxRevenue = Math.max(1, ...rows.map(r => r.revenue));
  return <section className={s.card}>
    <h2>So sánh doanh thu</h2>
    <p className={s.sub}>Trung bình 200 lượt cho mỗi chính sách và kịch bản, dùng cùng seed. Lượt mua thêm thủ công chỉ áp dụng ở chế độ diễn biến giá.</p>
    <div className={s.compareGrid}>{fixedRows.map(fixed => {
      const dyn = rows.find(r => r.policy === "v1.1" && r.scenario === fixed.scenario)!;
      const delta = dyn.revenue - fixed.revenue;
      return <section className={s.compareCard} key={fixed.scenario}>
        <h3>{fixed.scenario.split(" (")[0]}</h3><p>{fixed.scenario.match(/\((.*)\)/)?.[1].replace(" C", " sức chứa")}</p>
        <div className={s.bars} aria-hidden="true">
          {[fixed, dyn].map(r => <div key={r.policy} className={r === dyn ? s.dynamicBar : s.fixedBar} style={{ height: `${100 * r.revenue / maxRevenue}%` }} />)}
        </div>
        <table className={s.table}><thead><tr><th>Chỉ số</th><th>Cố định</th><th>Giá động</th></tr></thead>
          <tbody><tr><th>Doanh thu</th><td>{money(fixed.revenue)}</td><td>{money(dyn.revenue)}</td></tr>
            <tr><th>Đã bán</th><td>{percent(fixed.fillRate)}</td><td>{percent(dyn.fillRate)}</td></tr>
            <tr><th>Lần đổi/ngày</th><td>{number(fixed.changesPerDay)}</td><td>{number(dyn.changesPerDay)}</td></tr></tbody></table>
        <div className={s.delta}>Chênh lệch doanh thu <strong>{delta > 0 ? "+" : ""}{money(delta)}</strong></div>
      </section>;
    })}</div>
    <p className={s.sub}>Kết quả dựa trên nhu cầu mua vé giả định của từng kịch bản.</p>
  </section>;
}
