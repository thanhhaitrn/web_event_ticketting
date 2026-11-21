"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DEFAULT_WHAT_IF, type DemoConfig } from "@/lib/pricing-copilot/what-if-simulator";
import type { DemoRequest, DemoResponse } from "./simulation.worker";
import { Comparison, TimelineChart, explain, money, number, percent, timeLabel } from "./charts";
import s from "./demo.module.css";

const initial: DemoConfig = {
  capacity: DEFAULT_WHAT_IF.capacity, bounds: DEFAULT_WHAT_IF.bounds,
  phaseDays: DEFAULT_WHAT_IF.phaseDays, seed: DEFAULT_WHAT_IF.seed,
};

function ConfigForm({ config, apply }: { config: DemoConfig; apply: (value: DemoConfig) => void }) {
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string) => Number(form.get(key));
    const bounds = { floor: read("floor"), base: read("base"), ceiling: read("ceiling") };
    if (bounds.floor > bounds.base || bounds.base > bounds.ceiling) {
      setError("Giá cơ bản phải nằm giữa giá sàn và giá trần.");
      return;
    }
    setError("");
    apply({ capacity: read("capacity"), phaseDays: read("days"), seed: read("seed"), bounds });
  }
  return <form className={s.settings} onSubmit={submit}>
    <h2>Cấu hình đợt bán</h2>
    <label>Sức chứa (ghế)<input name="capacity" type="number" min="1" max="50000" defaultValue={config.capacity} required /></label>
    <label>Thời gian mở bán (ngày)<input name="days" type="number" min="1" max="60" defaultValue={config.phaseDays} required /></label>
    <fieldset><legend>Khung giá vé · VND</legend>
      {(["floor", "base", "ceiling"] as const).map((key, i) =>
        <label key={key}>{["Giá sàn", "Giá cơ bản", "Giá trần"][i]}<input name={key} type="number" min="1" max="2147483647" required defaultValue={config.bounds[key]} /></label>
      )}
    </fieldset>
    <label>Seed mô phỏng<input name="seed" type="number" min="0" max="4294967295" defaultValue={config.seed} required /></label>
    {error && <p role="alert" className={s.error}>{error}</p>}
    <button type="submit" className={s.apply}>Áp dụng và chạy lại</button>
  </form>;
}

export default function PricingDemo() {
  const [config, setConfig] = useState(initial);
  const [mode, setMode] = useState<"timeline" | "compare">("timeline");
  const [scenario, setScenario] = useState(0);
  const [purchases, setPurchases] = useState<Record<number, number>>({});
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useMemo<DemoRequest>(() => mode === "compare" ? { mode, config }
    : { mode, config, scenario, purchases }, [mode, config, scenario, purchases]);
  const [response, setResponse] = useState<{ request: DemoRequest; data: DemoResponse } | null>(null);

  useEffect(() => {
    let worker: Worker | undefined;
    const fail = () => setResponse({ request, data: { mode: "error", message: "Trình duyệt chưa chạy được mô phỏng. Hãy thử lại." } });
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

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setTick(t => Math.min(last, t + Math.max(1, Math.ceil(last / 100)))), 150);
    return () => window.clearInterval(timer);
  }, [running, last]);

  function seek(value: number) { setPlaying(false); setTick(value); }
  function reset() { seek(0); setPurchases({}); }
  function changeMode(next: typeof mode) { setPlaying(false); setMode(next); }

  return <>
    <nav className={s.tabs} aria-label="Chế độ mô phỏng">
      <button aria-pressed={mode === "timeline"} onClick={() => changeMode("timeline")}>Diễn biến giá</button>
      <button aria-pressed={mode === "compare"} onClick={() => changeMode("compare")}>So sánh doanh thu</button>
    </nav>
    <div className={s.workspace}>
      <aside><ConfigForm config={config} apply={(next) => { reset(); setConfig(next); }} /></aside>
      <div className={s.output} aria-busy={!result}>
        {mode === "timeline" && <section className={s.card}>
          <div className={s.sectionHead}><div><h2>Diễn biến giá</h2><p className={s.sub}>Chọn một mốc trên biểu đồ để xem quyết định giá.</p></div>
            <label className={s.scenario}>Kịch bản nhu cầu
              <select value={scenario} onChange={e => { reset(); setScenario(Number(e.target.value)); }}>
                <option value="0">Bán nhanh</option><option value="1">Bán đều</option><option value="2">Bán chậm</option>
              </select>
            </label>
          </div>
          {points && p && <>
            <div className={s.metrics}>
              <div><span>Giá vé tại mốc chọn</span><strong>{money(p.price)}</strong></div>
              <div><span>Số vé đã bán</span><strong>{number(p.sold)} <small>/ {number(config.capacity)}</small></strong></div>
              <div><span>Tỷ lệ kỳ vọng</span><strong>{percent(p.expected)}</strong></div>
            </div>
            <TimelineChart kind="price" points={points} index={tick} config={config} select={seek} />
            <TimelineChart kind="sold" points={points} index={tick} config={config} select={seek} />
            <div className={s.scrub}><label htmlFor="timeline-time">Thời điểm</label><strong>{timeLabel(tick, last)}</strong></div>
            <input id="timeline-time" className={s.slider} type="range" min="0" max={last} value={tick}
              aria-valuetext={timeLabel(tick, last)} onChange={e => seek(Number(e.target.value))} />
            <div className={s.actions}>
              <button className={s.primary} onClick={() => {
                if (tick === last) setTick(0);
                setPlaying(!running);
              }}>{running ? "Ⅱ  Tạm dừng" : tick === last ? "▶  Xem lại" : "▶  Chạy"}</button>
              <button disabled={tick === last} onClick={() => seek(tick + 1)}>Tiến 15 phút</button>
              <button disabled={tick === last || p.sold >= config.capacity} onClick={() => {
                setPlaying(false);
                setPurchases(prev => ({ ...prev, [tick]: (prev[tick] ?? 0) + 100 }));
              }}>+ Thêm 100 lượt mua</button>
              <button className={s.reset} onClick={reset}>Đặt lại</button>
            </div>
            <div className={s.reason}><h3>Vì sao giá {p.price > p.previousPrice ? "tăng" : p.price < p.previousPrice ? "giảm" : "giữ nguyên"}?</h3>
              <p>{explain(p, config.capacity)}</p>
              {p.added > 0 && <p><b>Đã thêm {number(p.added)} vé mua ở mức {money(p.price)}.</b> Tiến 15 phút để xem tác động lên giá.</p>}
            </div>
          </>}
        </section>}
        {!result && <p className={s.status} role="status">{mode === "compare" ? "Đang so sánh 200 lượt cho mỗi kịch bản…" : "Đang tính diễn biến giá…"}</p>}
        {result?.mode === "error" && <div role="alert" className={s.status}>{result.message} <button onClick={() => { setResponse(null); setRetry(n => n + 1); }}>Thử lại</button></div>}
        {result?.mode === "compare" && <Comparison rows={result.rows} />}
      </div>
    </div>
  </>;
}
