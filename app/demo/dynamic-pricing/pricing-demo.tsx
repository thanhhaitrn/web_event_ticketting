"use client";

import { useEffect, useMemo, useState } from "react";
import { effectiveRules, type DailyDemandConfig, type PolicyDetail, type SensitivityPoint, type SimulationPoint } from "@/lib/pricing-copilot/what-if-simulator";
import type { DemoRequest, DemoResponse } from "./simulation.worker";
import { ConfigForm, DEFAULT_SETUP, setupErrors, toConfig, type Setup } from "./config-form";
import { TimelineView } from "./timeline-view";
import { CompareView } from "./compare-view";
import s from "./demo.module.css";

type Mode = "timeline" | "compare";
type Keyed<T> = { key: string; config: DailyDemandConfig; data: T };

/** Chạy một yêu cầu trong Web Worker riêng; trả hàm huỷ (dừng worker khi thiết lập đổi tiếp). */
function runInWorker(request: DemoRequest, done: (r: DemoResponse) => void): () => void {
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<DemoResponse>) => done(e.data);
    worker.onerror = () => done({ mode: "error", message: "Chưa mở được mô phỏng. Bạn thử lại nhé." });
    worker.postMessage(request);
  } catch {
    done({ mode: "error", message: "Trình duyệt chưa hỗ trợ chạy mô phỏng nền." });
  }
  return () => worker?.terminate();
}

export default function PricingDemo() {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [mode, setMode] = useState<Mode>("timeline");
  const errors = setupErrors(setup);
  const valid = errors.length === 0;

  // áp dụng sau một nhịp nghỉ ngắn để gõ liên tục không chạy lại liên tục
  const [applied, setApplied] = useState<DailyDemandConfig>(() => toConfig(DEFAULT_SETUP));
  useEffect(() => {
    if (!valid) return;
    const t = window.setTimeout(() => setApplied(toConfig(setup)), 350);
    return () => window.clearTimeout(t);
  }, [setup, valid]);
  const key = useMemo(() => JSON.stringify(applied), [applied]);
  const rulesOf = (c: DailyDemandConfig) => effectiveRules({ k: c.rules?.k ?? 0.9, rules: c.rules });

  const [timeline, setTimeline] = useState<Keyed<SimulationPoint[]> | null>(null);
  const [details, setDetails] = useState<Keyed<{ fixed: PolicyDetail; dynamic: PolicyDetail }> | null>(null);
  const [sensitivity, setSensitivity] = useState<Keyed<SensitivityPoint[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const need: DemoRequest["mode"][] = mode === "timeline"
    ? (timeline?.key === key ? [] : ["timeline"])
    : [...(details?.key === key ? [] : ["compare" as const]), ...(sensitivity?.key === key ? [] : ["sensitivity" as const])];
  const next = need[0];

  useEffect(() => {
    if (!next) return;
    setError(null);
    const config = applied;
    return runInWorker({ mode: next, config }, (r) => {
      if (r.mode === "error") setError(r.message);
      else if (r.mode === "timeline") setTimeline({ key, config, data: r.points });
      else if (r.mode === "compare") setDetails({ key, config, data: r.details });
      else setSensitivity({ key, config, data: r.points });
    });
  }, [next, key, applied, retry]);

  // chỉ làm mờ khi kết quả chính của tab đang được tính lại (độ nhạy có chỗ chờ riêng)
  const primaryKey = mode === "timeline" ? timeline?.key : details?.key;
  const stale = primaryKey !== key || JSON.stringify(toConfig(setup)) !== key;
  const pickDemand = (dailyDemand: number) => setSetup((x) => ({ ...x, dailyDemand }));

  return <>
    <header className={s.head}>
      <div>
        <h1>Mô phỏng giá vé</h1>
        <p className={s.intro}>Chỉnh khung giá, nhu cầu và tham số thuật toán trong bảng Thiết lập — kết quả tự cập nhật. Mọi con số đều đi kèm công thức đã thay số.</p>
      </div>
      <nav className={s.tabs} aria-label="Chế độ mô phỏng">
        <button aria-pressed={mode === "timeline"} onClick={() => setMode("timeline")}>Diễn biến giá</button>
        <button aria-pressed={mode === "compare"} onClick={() => setMode("compare")}>So sánh doanh thu</button>
      </nav>
    </header>
    <div className={s.workspace}>
      <aside className={s.side}><ConfigForm value={setup} onChange={setSetup} /></aside>
      <div className={`${s.output} ${stale && valid ? s.stale : ""}`} aria-busy={stale && valid}>
        {stale && valid && !error && <p className={s.floatingStatus} role="status"><span className={s.spinner} aria-hidden="true" />Đang tính lại…</p>}
        {!valid && <p className={s.status} role="status">Sửa các ô được đánh dấu đỏ để chạy lại mô phỏng — kết quả bên dưới là của thiết lập hợp lệ gần nhất.</p>}
        {error && <div role="alert" className={s.status}>{error} <button onClick={() => { setError(null); setRetry((n) => n + 1); }}>Thử lại</button></div>}

        {mode === "timeline" && (timeline
          ? <TimelineView points={timeline.data} config={timeline.config} rules={rulesOf(timeline.config)} elasticity={timeline.config.elasticity ?? 1.2} />
          : <p className={s.status} role="status"><span className={s.spinner} aria-hidden="true" />Đang tính giá vé…</p>)}

        {mode === "compare" && (details
          ? <CompareView details={details.data} sensitivity={sensitivity?.key === details.key ? sensitivity.data : null}
              config={details.config} runs={details.config.runs ?? 200} elasticity={details.config.elasticity ?? 1.2} onPickDemand={pickDemand} />
          : <p className={s.status} role="status"><span className={s.spinner} aria-hidden="true" />Đang tính doanh thu…</p>)}
      </div>
    </div>
  </>;
}
