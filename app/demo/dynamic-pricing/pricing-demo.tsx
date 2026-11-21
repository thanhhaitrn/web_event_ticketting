"use client";

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { DEFAULT_WHAT_IF, type DailyDemandConfig, type DemoConfig } from "@/lib/pricing-copilot/what-if-simulator";
import type { DemoRequest, DemoResponse } from "./simulation.worker";
import { Comparison, TimelineChart, compactMoney, explain, money, percent, timeLabel, formatDailyDemand } from "./charts";
import { DECIMAL_PATTERN, INTEGER_PATTERN, integerFormat, readAmount, groupAmount, skipGroupSeparator } from "./number-input";
import s from "./demo.module.css";

const initial: DemoConfig = {
  capacity: DEFAULT_WHAT_IF.capacity, bounds: DEFAULT_WHAT_IF.bounds,
  phaseDays: DEFAULT_WHAT_IF.phaseDays, seed: DEFAULT_WHAT_IF.seed,
};
const PRICE_FIELDS = [["floor", "Giá sàn"], ["base", "Giá cơ bản"], ["ceiling", "Giá trần"]] as const;

function readBounds(form: FormData) {
  return { floor: readAmount(form, "floor"), base: readAmount(form, "base"), ceiling: readAmount(form, "ceiling") };
}

/** the floor, base and ceiling as one bar, so a base outside the band shows before applying */
function PriceBand({ bounds }: { bounds: DemoConfig["bounds"] }) {
  const { floor, base, ceiling } = bounds;
  const valid = floor <= base && base <= ceiling && floor < ceiling;
  const at = valid ? 100 * (base - floor) / (ceiling - floor) : 50;
  return <div className={`${s.band} ${valid ? "" : s.bandBad}`} aria-hidden="true">
    <div className={s.bandTrack}><span style={{ left: `${at}%` }} /></div>
    <div className={s.bandLabels}><span>{compactMoney(floor)}</span><b style={{ left: `${at}%` }}>{compactMoney(base)}</b><span>{compactMoney(ceiling)}</span></div>
  </div>;
}

function ConfigForm({ applied, apply }: { applied: DailyDemandConfig | null; apply: (value: DailyDemandConfig) => void }) {
  const config = applied ?? initial;
  const [error, setError] = useState("");
  const [bounds, setBounds] = useState(config.bounds);
  const [dirty, setDirty] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const capacity = readAmount(form, "capacity");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50_000) {
      setError("Sức chứa phải là số nguyên từ 1 đến 50.000 ghế.");
      return;
    }
    const bounds = readBounds(form);
    if (Object.values(bounds).some(n => !Number.isInteger(n) || n < 1 || n > 2147483647)) {
      setError("Hãy nhập giá vé từ 1 đến 2.147.483.647 đồng.");
      return;
    }
    if (bounds.floor > bounds.base || bounds.base > bounds.ceiling) {
      setError("Giá cơ bản phải nằm giữa giá sàn và giá trần.");
      return;
    }
    const dailyDemand = readAmount(form, "dailyDemand");
    if (!Number.isFinite(dailyDemand) || dailyDemand < 0 || dailyDemand > 50000) {
      setError("Số vé dự kiến bán mỗi ngày phải từ 0 đến 50.000.");
      return;
    }
    setError("");
    setDirty(false);
    apply({ ...config, dailyDemand, capacity, phaseDays: Number(form.get("days")), bounds });
  }
  return <form className={s.settings} onSubmit={submit} onInput={(e) => {
    const form = new FormData(e.currentTarget);
    const next = readBounds(form);
    if (Object.values(next).every(Number.isFinite)) setBounds(next);
    setDirty(true);
  }}>
    <h2>Thiết lập đợt bán vé</h2>
    <div className={s.pair}>
      <label>Sức chứa<span className={s.unit}><input name="capacity" type="text" inputMode="numeric" pattern={INTEGER_PATTERN} required
        defaultValue={integerFormat.format(config.capacity)}
        onKeyDown={skipGroupSeparator} onInput={e => groupAmount(e.currentTarget)} /><i>ghế</i></span></label>
      <label>Thời gian mở bán<span className={s.unit}><input name="days" type="number" min="1" max="60" defaultValue={config.phaseDays} required /><i>ngày</i></span></label>
    </div>
    <fieldset><legend>Khung giá vé</legend>
      {PRICE_FIELDS.map(([key, label]) =>
        <label key={key}>{label}<span className={s.unit}><input name={key} type="text" inputMode="numeric" pattern={INTEGER_PATTERN} required
          defaultValue={integerFormat.format(config.bounds[key])}
          onKeyDown={skipGroupSeparator}
          onInput={e => groupAmount(e.currentTarget)} /><i>₫</i></span></label>
      )}
      <PriceBand bounds={bounds} />
    </fieldset>
    <fieldset><legend>Nhu cầu mua vé</legend>
      <label>Số vé dự kiến bán mỗi ngày
        <span className={s.unit}><input name="dailyDemand" required type="text" inputMode="decimal"
          pattern={DECIMAL_PATTERN}
          onKeyDown={skipGroupSeparator} onInput={e => groupAmount(e.currentTarget)}
          placeholder="Ví dụ: 1.000" aria-describedby="daily-demand-hint" /><i>vé/ngày</i></span>
        <small id="daily-demand-hint">Ước tính trung bình một ngày bạn sẽ bán được bao nhiêu vé nếu giữ giá cơ bản.</small>
      </label>
    </fieldset>
    {error && <p role="alert" className={s.error}>{error}</p>}
    <button type="submit" className={s.apply} disabled={!dirty}>{!applied ? "Chạy mô phỏng" : dirty ? "Chạy lại mô phỏng" : "Đã áp dụng"}</button>
  </form>;
}

export default function PricingDemo() {
  const [applied, setApplied] = useState<DailyDemandConfig | null>(null);
  const config = applied ?? initial;
  const [mode, setMode] = useState<"timeline" | "compare">("timeline");
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useMemo<DemoRequest | null>(() => {
    return applied ? { mode, config: applied } : null;
  }, [mode, applied]);
  const [response, setResponse] = useState<{ request: DemoRequest; data: DemoResponse } | null>(null);

  useEffect(() => {
    if (!request) return;
    let worker: Worker | undefined;
    const fail = () => setResponse({ request, data: { mode: "error", message: "Chưa mở được mô phỏng. Bạn thử lại nhé." } });
    try {
      worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<DemoResponse>) => setResponse({ request, data: event.data });
      worker.onerror = fail;
      worker.postMessage(request);
    } catch {
      fail();
    }
    return () => worker?.terminate();
  }, [request, retry]);

  const result = response?.request === request ? response.data : null;
  const points = result?.mode === "timeline" ? result.points : null;
  const last = points ? points.length - 1 : 0;
  const p = points?.[tick];
  const running = playing && !!points && tick < last;
  const revenue = useMemo(() => {
    let total = 0;
    return points?.map((point, i) => {
      if (i > 0) total += (point.sold - points[i - 1].sold) * points[i - 1].price;
      return total;
    }) ?? [];
  }, [points]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTick(t => Math.min(last, t + Math.max(1, Math.ceil(last / 100)))), 150);
    return () => window.clearInterval(timer);
  }, [running, last]);

  function seek(value: number) { setPlaying(false); setTick(value); }
  function applyConfig(next: DailyDemandConfig) {
    seek(0);
    setApplied(next);
  }
  function changeMode(next: typeof mode) { setPlaying(false); setMode(next); }

  const change = p && p.previousPrice ? (p.price - p.previousPrice) / p.previousPrice : 0;
  const pace = p ? p.sold / config.capacity - p.expected : 0;

  return <>
    <header className={s.head}>
      <div>
        <h1>Mô phỏng giá vé</h1>
        <p className={s.intro}>Thử xem giá vé và doanh thu thay đổi thế nào với lượng vé bạn dự kiến bán mỗi ngày.</p>
      </div>
      <nav className={s.tabs} aria-label="Chế độ mô phỏng">
        <button aria-pressed={mode === "timeline"} onClick={() => changeMode("timeline")}>Diễn biến giá</button>
        <button aria-pressed={mode === "compare"} onClick={() => changeMode("compare")}>So sánh doanh thu</button>
      </nav>
    </header>
    <div className={s.workspace}>
      <aside className={s.side}><ConfigForm applied={applied} apply={applyConfig} /></aside>
      <div className={s.output} aria-busy={!!request && !result}>
        {!applied && <section className={s.card}>
          <h2>{mode === "timeline" ? "Diễn biến giá" : "So sánh doanh thu"}</h2>
          <p className={s.sub}>Nhập số vé dự kiến bán mỗi ngày rồi bấm “Chạy mô phỏng” để xem kết quả.</p>
        </section>}
        {mode === "timeline" && applied && <section className={s.card}>
          <h2>Diễn biến giá</h2>
          <p className={s.sub}>Dự báo của bạn là {formatDailyDemand(applied.dailyDemand)} vé/ngày ở giá cơ bản.</p>
          {points && p && <>
            <div className={s.metrics}>
              <div className={s.metricMain}><span>Giá vé lúc này</span><strong>{money(p.price)}</strong>
                <em className={change > 0 ? s.up : change < 0 ? s.down : ""}>{change > 0 ? "▲" : change < 0 ? "▼" : "•"} {change ? percent(Math.abs(change)) : "Giữ nguyên"}</em></div>
              <div><span>Đã bán</span><strong>{integerFormat.format(p.sold)} <small>/ {integerFormat.format(config.capacity)}</small></strong>
                <meter min={0} max={config.capacity} value={p.sold} className={s.meter} aria-label="Tỷ lệ đã bán" /></div>
              <div><span>Dự kiến bán được</span><strong>{percent(p.expected)}</strong>
                <em className={pace > 0.02 ? s.up : pace < -0.02 ? s.down : ""}>{pace > 0.02 ? "Bán nhanh hơn" : pace < -0.02 ? "Bán chậm hơn" : "Đúng tiến độ"}</em></div>
              <div><span>Doanh thu đến lúc này</span><strong title={money(revenue[tick])}>{compactMoney(revenue[tick])}</strong></div>
            </div>
            <TimelineChart kind="price" points={points} index={tick} config={config} select={seek} />
            <TimelineChart kind="sold" points={points} index={tick} config={config} select={seek} />
            <div className={s.player}>
              <button className={s.play} aria-label={running ? "Tạm dừng" : tick === last ? "Xem lại" : "Chạy"} onClick={() => {
                if (tick === last) setTick(0);
                setPlaying(!running);
              }}>{running ? "❚❚" : "▶"}</button>
              <div className={s.timeline}>
                <div className={s.scrub}><label htmlFor="timeline-time">Thời điểm</label><strong>{timeLabel(tick, last, p.sold >= config.capacity)}</strong></div>
                <input id="timeline-time" className={s.slider} type="range" min="0" max={last} value={tick}
                  style={{ "--at": `${100 * tick / Math.max(1, last)}%` } as CSSProperties}
                  aria-valuetext={timeLabel(tick, last, p.sold >= config.capacity)} onChange={e => seek(Number(e.target.value))} />
              </div>
            </div>
            <div className={s.actions}>
              <button className={s.reset} onClick={() => seek(0)}>Về ban đầu</button>
            </div>
            {p.decision?.changed && <div className={s.reason}>
              <h3>Vì sao giá {p.price > p.previousPrice ? "tăng" : "giảm"}?</h3>
              <p>{explain(p, config.capacity)}</p>
            </div>}
          </>}
        </section>}
        {request && !result && <p className={s.status} role="status"><span className={s.spinner} aria-hidden="true" />{mode === "compare" ? "Đang tính doanh thu…" : "Đang tính giá vé…"}</p>}
        {result?.mode === "error" && <div role="alert" className={s.status}>{result.message} <button onClick={() => { setResponse(null); setRetry(n => n + 1); }}>Thử lại</button></div>}
        {result?.mode === "compare" && applied && <Comparison rows={result.rows} dailyDemand={applied.dailyDemand} />}
      </div>
    </div>
  </>;
}
