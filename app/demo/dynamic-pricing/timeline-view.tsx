"use client";

/**
 * Tab "Diễn biến giá": một lần mô phỏng v1.1, xem lại từng chu kỳ 15 phút.
 * Ba biểu đồ đồng bộ con trỏ (giá · tiến độ bán · hệ số) + bảng công thức tại thời điểm chọn.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { floorTo } from "@/lib/pricing/rules";
import type { PricingRules } from "@/lib/pricing/types";
import {
  DEMAND_SHAPE_LABEL_VI, TICKS_PER_DAY, phaseTicks,
  type DailyDemandConfig, type SimulationPoint,
} from "@/lib/pricing-copilot/what-if-simulator";
import { LineChart } from "./chart-kit";
import { explain, timeLabel } from "./charts";
import { FormulaPanel, pct, spct, vnd } from "./formula-panel";
import s from "./demo.module.css";

const nf = (d: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: d });
const mil = (v: number) => nf(2).format(v / 1e6) + " tr";
const COLORS = { price: "#5b21c7", target: "#d97706", plan: "#8a8e96", up: "#14804a", down: "#cf2f2f", last: "rgba(217, 119, 6, .09)" };

/** Nhãn trục thời gian: theo giờ nếu đợt ngắn, theo ngày nếu dài. */
export function timeAxis(phaseDays: number) {
  const hours = phaseDays <= 2;
  return {
    xs: (tick: number) => (hours ? tick / 4 : tick / TICKS_PER_DAY),
    format: (x: number) => (x === 0 ? "Mở bán" : hours ? `${nf(1).format(x)} giờ` : `Ngày ${nf(1).format(x)}`),
  };
}

function csv(points: SimulationPoint[], capacity: number) {
  const head = ["chu_ky", "thoi_diem", "gia", "gia_muc_tieu", "gia_24h_truoc", "da_ban", "O", "E", "D", "a_cau", "a_gio_chot", "m", "u", "lambda", "gioi_han"];
  const rows = points.map((p) => {
    const d = p.decision;
    const minutes = p.tick * 15;
    const when = `Ngay ${1 + Math.floor(minutes / 1440)} ${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return [p.tick, when, p.price, d?.target ?? "", p.price24hAgo, p.soldAtQuote, (p.soldAtQuote / capacity).toFixed(4),
      p.expected.toFixed(4), d ? d.deviation.toFixed(4) : "", d ? d.adjustments.demand.toFixed(4) : "",
      d ? d.adjustments.lastMinute.toFixed(4) : "", d ? d.m.toFixed(4) : "", d ? d.u.toFixed(4) : "", p.lambda.toFixed(3), d?.limitedBy.join("|") ?? ""];
  });
  return [head, ...rows].map((r) => r.join(",")).join("\n");
}

export function TimelineView({ points, config, rules, elasticity }: {
  points: SimulationPoint[]; config: DailyDemandConfig; rules: PricingRules; elasticity: number;
}) {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const last = points.length - 1;
  const T = phaseTicks(config.phaseDays);
  const C = config.capacity;
  const { floor: F, base: B, ceiling: Ce } = config.bounds;
  const axis = useMemo(() => timeAxis(config.phaseDays), [config.phaseDays]);
  const xs = useMemo(() => points.map((p) => axis.xs(p.tick)), [points, axis]);

  useEffect(() => { setTick(0); setPlaying(false); }, [points]);
  const i = Math.min(tick, last);
  const p = points[i];
  const running = playing && i < last;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTick((t) => Math.min(last, t + Math.max(1, Math.ceil(last / 120)) * speed)), 120);
    return () => window.clearInterval(timer);
  }, [running, last, speed]);

  const revenue = useMemo(() => {
    let total = 0;
    return points.map((pt, k) => {
      if (k > 0) total += (pt.sold - points[k - 1].sold) * points[k - 1].price;
      return total;
    });
  }, [points]);
  const changes = useMemo(() => points.flatMap((pt, k) => (pt.decision?.changed ? [k] : [])), [points]);
  const stats = useMemo(() => {
    const prices = points.map((pt) => pt.price);
    return { min: Math.min(...prices), max: Math.max(...prices), ups: changes.filter((k) => points[k].price > points[k].previousPrice).length };
  }, [points, changes]);

  const cap24 = floorTo(rules.dailyCapRatio * B, rules.roundTo);
  const lastMinuteFrom = rules.lastMinuteHours > (config.showAfterPhaseHours ?? 240)
    ? Math.max(0, T - 4 * (rules.lastMinuteHours - (config.showAfterPhaseHours ?? 240))) : null;
  const regions = lastMinuteFrom !== null && lastMinuteFrom < T
    ? [{ from: axis.xs(lastMinuteFrom), to: axis.xs(T), label: `${nf(0).format(rules.lastMinuteHours)} giờ trước đêm diễn`, color: COLORS.last }] : [];

  const seek = (k: number) => { setPlaying(false); setTick(Math.max(0, Math.min(last, k))); };
  const prevChange = [...changes].reverse().find((k) => k < i);
  const nextChange = changes.find((k) => k > i);
  const change = p.previousPrice ? (p.price - p.previousPrice) / p.previousPrice : 0;
  const O = p.soldAtQuote / C;
  const D = O - p.expected;
  const when = timeLabel(i, last, p.sold >= C);
  const decisionAt = (k: number) => points[k].decision;

  function download() {
    const blob = new Blob(["﻿" + csv(points, C)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mo-phong-gia-ve.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section className={s.card}>
      <div className={s.sectionHead}>
        <div>
          <h2>Diễn biến giá</h2>
          <p className={s.sub}>
            Một lần mô phỏng: trung bình {nf(1).format(config.dailyDemand)} vé/ngày ở giá cơ bản · {DEMAND_SHAPE_LABEL_VI[config.shape ?? "even"].toLowerCase()}.
            Giá dao động {mil(stats.min)} – {mil(stats.max)}, đổi {changes.length} lần ({stats.ups} tăng, {changes.length - stats.ups} giảm).
          </p>
        </div>
        <button type="button" className={s.ghostBtn} onClick={download}>Tải CSV</button>
      </div>

      <div className={s.metrics5}>
        <div className={s.metricMain}><span>Giá lúc này</span><strong>{vnd(p.price)}</strong>
          <em className={change > 0 ? s.up : change < 0 ? s.down : ""}>{change ? `${change > 0 ? "▲" : "▼"} ${spct(change)} so với chu kỳ trước` : "• giữ nguyên"}</em></div>
        <div><span>Giá mục tiêu P′</span><strong>{p.decision ? vnd(p.decision.target) : "—"}</strong>
          <em>{p.decision ? (p.decision.target === p.price ? "đã đạt" : `còn ${vnd(Math.abs(p.decision.target - p.price))}`) : ""}</em></div>
        <div><span>Đã bán (S/C)</span><strong>{nf(0).format(p.soldAtQuote)} <small>/ {nf(0).format(C)}</small></strong>
          <meter min={0} max={C} value={p.soldAtQuote} className={s.meter} aria-label="Tỷ lệ đã bán" /></div>
        <div><span>Lệch tiến độ D = O − E</span><strong className={D > rules.deadZone ? s.up : D < -rules.deadZone ? s.down : ""}>{spct(D)}</strong>
          <em>{D > rules.deadZone ? "bán nhanh hơn kế hoạch" : D < -rules.deadZone ? "bán chậm hơn kế hoạch" : `trong vùng chết ±${pct(rules.deadZone)}`}</em></div>
        <div><span>Doanh thu tích luỹ</span><strong title={vnd(revenue[i])}>{mil(revenue[i])}</strong>
          <em>{p.sold ? `giá bình quân ${vnd(revenue[i] / p.sold)}/vé` : "chưa có vé bán"}</em></div>
      </div>

      <LineChart title="Giá vé theo thời gian" height={250}
        subtitle={<>Bậc thang tím là giá bán; đường cam là giá mục tiêu P′ mà công thức muốn tới — khoảng cách giữa hai đường là phần bị các giới hạn thay đổi giữ lại.</>}
        xs={xs} xFormat={axis.format} xTooltip={(_, k) => timeLabel(k, last, points[k].sold >= C)} yFormat={mil}
        yInclude={[F, Ce]} cursor={i} onSelect={seek} regions={regions}
        refLines={[{ y: Ce, label: `Trần ${mil(Ce)}`, color: COLORS.down }, { y: B, label: `Cơ bản ${mil(B)}` }, { y: F, label: `Sàn ${mil(F)}`, color: COLORS.up }]}
        bands={[{ id: "cap24", label: "Biên 24 giờ", color: "rgba(91, 33, 199, .07)", toggle: true, hiddenByDefault: true,
          lower: points.map((pt) => Math.max(F, pt.price24hAgo - cap24)), upper: points.map((pt) => Math.min(Ce, pt.price24hAgo + cap24)) }]}
        markers={changes.map((k) => ({ index: k, y: points[k].price, dir: points[k].price > points[k].previousPrice ? "up" : "down",
          color: points[k].price > points[k].previousPrice ? COLORS.up : COLORS.down, title: `${timeLabel(k, last, false)}: ${vnd(points[k].previousPrice)} → ${vnd(points[k].price)}` }))}
        series={[
          { id: "price", label: "Giá bán", values: points.map((pt) => pt.price), color: COLORS.price, kind: "step", area: true, toggle: false, format: vnd },
          { id: "target", label: "Giá mục tiêu P′", values: points.map((pt) => pt.decision?.target ?? null), color: COLORS.target, kind: "step", dash: "5 4", width: 1.8, format: vnd },
        ]}
        extraTooltip={(k) => {
          const d = decisionAt(k);
          return d && <small className={s.tipNote}>D {spct(d.deviation)} · m {spct(d.m)}{d.limitedBy.length ? ` · giới hạn: ${d.limitedBy.join(", ")}` : ""}</small>;
        }} />

      <LineChart title="Tiến độ bán so với kế hoạch" height={200}
        subtitle={<>Khi đường tím ra khỏi dải vùng chết E ± δ, hệ số a_cầu bắt đầu đẩy giá lên (phía trên) hoặc kéo giá xuống (phía dưới).</>}
        xs={xs} xFormat={axis.format} xTooltip={(_, k) => timeLabel(k, last, points[k].sold >= C)} yFormat={(v) => pct(v, 0)}
        yDomain={[0, 1.02]} cursor={i} onSelect={seek} regions={regions}
        bands={[{ id: "dead", label: `Vùng chết E ± ${pct(rules.deadZone, 0)}`, color: "rgba(138, 142, 150, .14)", toggle: true,
          lower: points.map((pt) => Math.max(0, pt.expected - rules.deadZone)), upper: points.map((pt) => Math.min(1, pt.expected + rules.deadZone)) }]}
        series={[
          { id: "sold", label: "Đã bán O", values: points.map((pt) => pt.soldAtQuote / C), color: COLORS.price, toggle: false, format: (v) => pct(v) },
          { id: "plan", label: "Kế hoạch E", values: points.map((pt) => pt.expected), color: COLORS.plan, dash: "5 4", width: 1.8, format: (v) => pct(v) },
        ]} />

      <LineChart title="Hệ số điều chỉnh" height={190}
        subtitle={<>m = a_cầu + a_giờ_chót + a_giữ, kẹp trong ±{pct(rules.totalAdjCap, 0)}; u = m ÷ {pct(rules.totalAdjCap, 0)} quyết định giá mục tiêu.</>}
        xs={xs} xFormat={axis.format} xTooltip={(_, k) => timeLabel(k, last, points[k].sold >= C)} yFormat={(v) => spct(v, 0)}
        yDomain={[-rules.totalAdjCap * 1.15, rules.totalAdjCap * 1.15]} cursor={i} onSelect={seek} regions={regions}
        refLines={[{ y: rules.totalAdjCap, label: `+${pct(rules.totalAdjCap, 0)}` }, { y: 0, label: "0", dash: "1 0", color: "#c9cbd1" }, { y: -rules.totalAdjCap, label: `−${pct(rules.totalAdjCap, 0)}` }]}
        series={[
          { id: "m", label: "m (tổng)", values: points.map((pt) => pt.decision?.m ?? null), color: COLORS.price, kind: "step", format: (v) => spct(v) },
          { id: "demand", label: "a_cầu", values: points.map((pt) => pt.decision?.adjustments.demand ?? null), color: "#2563eb", kind: "step", width: 1.6, format: (v) => spct(v) },
          { id: "last", label: "a_giờ_chót", values: points.map((pt) => pt.decision?.adjustments.lastMinute ?? null), color: COLORS.target, kind: "step", width: 1.6, format: (v) => spct(v) },
        ]} />

      <div className={s.player}>
        <button className={s.play} aria-label={running ? "Tạm dừng" : i === last ? "Xem lại" : "Chạy"} onClick={() => {
          if (i === last) setTick(0);
          setPlaying(!running);
        }}>{running ? "❚❚" : "▶"}</button>
        <div className={s.timeline}>
          <div className={s.scrub}><label htmlFor="timeline-time">Thời điểm</label><strong>{when}</strong></div>
          <input id="timeline-time" className={s.slider} type="range" min="0" max={last} value={i}
            style={{ "--at": `${(100 * i) / Math.max(1, last)}%` } as CSSProperties}
            aria-valuetext={when} onChange={(e) => seek(Number(e.target.value))} />
        </div>
        <select className={s.speed} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Tốc độ phát">
          {[1, 2, 4].map((v) => <option key={v} value={v}>{v}×</option>)}
        </select>
      </div>
      <div className={s.actions}>
        <button type="button" disabled={prevChange === undefined} onClick={() => prevChange !== undefined && seek(prevChange)}>◀ Lần đổi giá trước</button>
        <button type="button" disabled={nextChange === undefined} onClick={() => nextChange !== undefined && seek(nextChange)}>Lần đổi giá sau ▶</button>
        <button type="button" className={s.reset} onClick={() => seek(0)}>Về lúc mở bán</button>
      </div>

      <div className={s.reason}>
        <h3>{p.decision?.changed ? `Vì sao giá ${p.price > p.previousPrice ? "tăng" : "giảm"}?` : "Diễn giải"}</h3>
        <p>{explain(p, C, rules)}</p>
      </div>

      <FormulaPanel point={p} config={config} rules={rules} phaseTicks={T} elasticity={elasticity} timeLabel={when} />
    </section>
  );
}
