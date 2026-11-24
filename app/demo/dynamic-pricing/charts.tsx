import { useId } from "react";
import type { DemoConfig, PolicyResult, SimulationPoint } from "@/lib/pricing-copilot/what-if-simulator";
import { phaseTicks } from "@/lib/pricing-copilot/what-if-simulator";
import { DEFAULT_PRICING_RULES } from "@/lib/pricing/rules";
import s from "./demo.module.css";

export const formatDailyDemand = new Intl.NumberFormat("vi-VN", { maximumSignificantDigits: 21 }).format;
const numbers = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
export const number = (value: number) => numbers.format(value);
export const money = (value: number) => number(Math.round(value)) + " ₫";
export const percent = (ratio: number) => number(ratio * 100) + "%";
const compactAmount = (value: number) =>
  Math.abs(value) >= 1e9 ? number(value / 1e9) + " tỷ"
  : Math.abs(value) >= 1e6 ? number(value / 1e6) + " tr"
  : number(Math.round(value));
export const compactMoney = (value: number) => compactAmount(value) + " ₫";
const axisMoney = (value: number) => number(value / 1e6) + " tr";
export function timeLabel(tick: number, last: number, soldOut: boolean) {
  if (tick === last && !soldOut) return "Kết thúc đợt bán";
  const minutes = tick * 15;
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const label = `Ngày ${1 + Math.floor(minutes / 1440)} · ${hh}:${mm}`;
  return soldOut ? `${label} · Hết vé` : label;
}

export function explain(p: SimulationPoint, capacity: number) {
  const d = p.decision;
  if (!d) return `Đợt bán khép lại với ${number(p.sold)}/${number(capacity)} vé đã bán. Giá vé cuối đợt là ${money(p.price)}.`;
  if (p.tick === 0 && !d.changed && !d.adjustments.lastMinute) {
    return `Vé mở bán ở mức ${money(p.price)}. Sau 15 phút, giá sẽ được tính lại dựa trên số vé đã bán.`;
  }
  const rules = DEFAULT_PRICING_RULES;
  const planned = number(Math.round(d.expected * capacity));
  const sold = number(p.soldAtQuote);
  let progress = `Đã bán ${sold} vé, gần với mức dự kiến là ${planned} vé.`;
  if (d.deviation > rules.deadZone) {
    progress = `Khách đã mua ${sold} vé. Dự kiến đến giờ này mới bán được khoảng ${planned} vé.`;
    if (!d.adjustments.demand) {
      const minimum = Math.ceil(Math.max(rules.minSoldAbs, rules.minSoldRatio * capacity));
      progress += ` Cần bán ít nhất ${number(minimum)} vé mới bắt đầu xét tăng giá theo nhu cầu.`;
    }
  } else if (d.adjustments.demand < 0) {
    progress = `Mới bán được ${sold} vé, trong khi dự kiến đến giờ này bán được khoảng ${planned} vé.`;
  }
  const movement = !d.changed ? `Giá vẫn là ${money(p.price)}.`
    : p.price > p.previousPrice ? `Giá tăng từ ${money(p.previousPrice)} lên ${money(p.price)}.`
    : `Giá giảm từ ${money(p.previousPrice)} xuống ${money(p.price)}.`;
  const limits: Record<string, string> = {
    step10: `Mỗi 15 phút, giá chỉ có thể tăng hoặc giảm tối đa ${percent(rules.stepRatio)} giá cơ bản.`,
    cap24h: `Giá đã chạm giới hạn thay đổi trong 24 giờ, bằng ${percent(rules.dailyCapRatio)} giá cơ bản.`,
    deadband: `Mức điều chỉnh còn lại chưa tới ${percent(rules.minChangeRatio)} giá cơ bản nên giá vẫn giữ nguyên.`,
    bounds: "Giá vé phải nằm trong khoảng từ giá sàn đến giá trần.",
  };
  return [progress, d.adjustments.lastMinute ? "Sắp đến giờ diễn mà vẫn còn trống hơn nửa số ghế." : "",
    movement, ...d.limitedBy.map(limit => limits[limit])].filter(Boolean).join(" ");
}

function elapsedLabel(minutes: number) {
  if (minutes < 60) return `${number(minutes)} phút`;
  if (minutes < 1440) return `${number(minutes / 60)} giờ`;
  return `${number(minutes / 1440)} ngày`;
}

type ChartPoint = Pick<SimulationPoint, "tick" | "price" | "sold" | "expected">;

export function TimelineChart({ kind, points, index, config, select }: {
  kind: "price" | "sold"; points: ChartPoint[]; index: number; config: DemoConfig; select: (n: number) => void;
}) {
  const fillId = useId();
  const price = kind === "price";
  const last = points.length - 1;
  const elapsedMinutes = config.phaseDays * 1440 * points[last].tick / phaseTicks(config.phaseDays);
  const soldOut = points[last].sold >= config.capacity;
  const top = price ? config.bounds.ceiling : 1;
  const bottom = price ? config.bounds.floor : 0;
  // 0..100 in both directions, so the same numbers place SVG paths and HTML labels
  const x = (t: number) => 100 * t / Math.max(1, last);
  const y = (v: number) => top === bottom ? 50 : 4 + 92 * (top - v) / (top - bottom);
  const value = (p: ChartPoint) => price ? p.price : p.sold / config.capacity;
  const ref = (p: ChartPoint) => price ? config.bounds.base : p.expected;
  const title = price ? "Giá vé theo thời gian" : "Tiến độ bán vé";
  const path = points.map((p, i) =>
    `${i === 0 ? "M" : "L"}${x(i).toFixed(3)},${y(value(p)).toFixed(3)}`
  ).join(" ");
  const labels = price
    ? [[config.bounds.ceiling, "Trần"], [config.bounds.base, "Cơ bản"], [config.bounds.floor, "Sàn"]] as const
    : [[1, ""], [0.5, ""], [0, ""]] as const;
  const ticks = new Map<number, string>();
  for (const [v, label] of labels) {
    ticks.set(v, [ticks.get(v), label].filter(Boolean).join(" / "));
  }
  return <figure className={s.figure} data-series={kind}>
    <figcaption><h3>{title}</h3><span className={s.legend}><i />{price ? "Giá động" : "Đã bán"} <i className={s.dash} />{price ? "Giá cơ bản" : "Theo kế hoạch"}</span></figcaption>
    <div className={s.plot}>
      <div className={s.axis}>{Array.from(ticks, ([v, name]) =>
        <span key={v} style={{ top: `${y(v)}%` }}>{price ? axisMoney(v) : percent(v)}{name && <em>{name}</em>}</span>)}
      </div>
      <div className={s.area}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={title}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            select(Math.max(0, Math.min(last, Math.round((e.clientX - box.left) / box.width * last))));
          }}>
          <defs>
            <linearGradient id={fillId} x2="0" y2="1">
              <stop stopColor="var(--series-color)" stopOpacity=".22" />
              <stop offset="1" stopColor="var(--series-color)" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {Array.from(ticks, ([v]) => <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)} className={s.gridLine} />)}
          <path d={path + " V100 H0 Z"} fill={`url(#${fillId})`} />
          <path d={`M0,${y(ref(points[0]))} L100,${y(ref(points[last]))}`} className={s.reference} />
          <path d={path} className={s.line} />
          <line x1={x(index)} x2={x(index)} y1="0" y2="100" className={s.cursor} />
        </svg>
        {/* drawn in HTML, since the stretched SVG would squash a circle */}
        <span className={s.dot} style={{ left: `${x(index)}%`, top: `${y(value(points[index]))}%` }} />
      </div>
    </div>
    <div className={s.xaxis}><span>Mở bán</span><span>{elapsedLabel(elapsedMinutes / 2)}</span><span>{soldOut && "Hết vé · "}{elapsedLabel(elapsedMinutes)}</span></div>
  </figure>;
}

export function Comparison({ rows, dailyDemand }: { rows: PolicyResult[]; dailyDemand: number }) {
  const [fixed, dynamic] = rows; // The worker requests these two policies in this order.
  const maxRevenue = Math.max(1, fixed.revenue, dynamic.revenue);
  const delta = dynamic.revenue - fixed.revenue;
  const share = fixed.revenue > 0 ? delta / fixed.revenue : 0;
  const even = Math.abs(share) < 0.005;
  return <section className={s.card}>
    <h2>So sánh doanh thu</h2>
    <p className={s.sub}>Với dự báo {formatDailyDemand(dailyDemand)} vé/ngày, mỗi cách đặt giá được thử 200 lần. Bảng dưới đây hiển thị kết quả trung bình.</p>
    <div className={`${s.delta} ${even ? "" : delta > 0 ? s.up : s.down}`}>
      <span>Chênh lệch khi dùng giá động</span>
      <strong>{delta > 0 ? "+" : ""}{number(Math.round(delta))} VND</strong>
      <small>{even ? "Gần như bằng nhau" : `${delta > 0 ? "+" : ""}${percent(share)} doanh thu`}</small>
    </div>
    <figure className={s.revenueFigure}>
      <figcaption>Doanh thu trung bình (VND)</figcaption>
      <div className={s.bars}>
        {rows.map(r => <div key={r.policy} className={s.barSlot}>
          <span className={s.barValue}>{compactAmount(r.revenue)}</span>
          <div className={r.policy === "fixed" ? s.fixedBar : s.dynamicBar} style={{ height: `${100 * r.revenue / maxRevenue}%` }} />
        </div>)}
      </div>
      <div className={s.barNames}><span>Giá cố định</span><span>Giá động</span></div>
    </figure>
    <table className={s.table} aria-label="Kết quả trung bình theo cách đặt giá">
      <thead><tr><th scope="col">Chỉ số</th><th scope="col">Giá cố định</th><th scope="col">Giá động</th></tr></thead>
      <tbody>
        <tr><th scope="row">Doanh thu (VND)</th>{rows.map(r =>
          <td key={r.policy} title={`${number(Math.round(r.revenue))} VND`}>{compactAmount(r.revenue)}</td>)}</tr>
        <tr><th scope="row">Tỷ lệ vé đã bán</th><td>{percent(fixed.fillRate)}</td><td>{percent(dynamic.fillRate)}</td></tr>
        <tr><th scope="row">Số lần đổi giá/ngày</th><td>{number(fixed.changesPerDay)}</td><td>{number(dynamic.changesPerDay)}</td></tr>
      </tbody>
    </table>
  </section>;
}
