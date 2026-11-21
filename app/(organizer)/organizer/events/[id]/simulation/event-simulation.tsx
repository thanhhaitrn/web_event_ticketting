"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import FilterMenu from "@/components/FilterMenu";
import { TimelineChart, compactMoney, money, percent } from "@/app/demo/dynamic-pricing/charts";
import { DECIMAL_PATTERN, groupAmount, integerFormat, readAmount, skipGroupSeparator } from "@/app/demo/dynamic-pricing/number-input";
import { DEFAULT_WHAT_IF, phaseTicks, type EventTierInput } from "@/lib/pricing-copilot/what-if-simulator";
import type { EventResult, TierResult } from "./event.worker";
import s from "@/app/demo/dynamic-pricing/demo.module.css";
import css from "./event.module.css";

type Show = { id: string; name: string; startTime: Date };
type Phase = Show & { endTime: Date };
type Zone = {
  id: string; name: string;
  quotas: { showId: string; capacity: number }[];
  prices: { phaseId: string; floorPrice: number; basePrice: number; ceilingPrice: number }[];
};
type Tier = { id: string; name: string; capacity: number; bounds: EventTierInput["bounds"] };
const date = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
});
const days = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const hour = 3_600_000;
const signed = (value: number, format: (n: number) => string) => (value > 0 ? "+" : "") + format(value);
/** "up" for more revenue, "down" for less; a tenth of a percent either way counts as even */
const trend = (delta: number, base: number) => delta === 0 || (base > 0 && Math.abs(delta / base) < 0.001) ? "" : delta > 0 ? "up" : "down";
const tone = (delta: number, base: number) => ({ up: s.up, down: s.down, "": "" })[trend(delta, base)];

export default function EventSimulation({ event, initialPhase }: {
  event: { shows: Show[]; phases: Phase[]; zones: Zone[] }; initialPhase?: string;
}) {
  const { shows, phases, zones } = event;
  const [showId, setShowId] = useState(shows[0]?.id);
  const [phaseId, setPhaseId] = useState(initialPhase);
  const show = shows.find(item => item.id === showId);
  const phase = phases.find(item => item.id === phaseId) ?? phases[0];
  if (!show || !phase) return <p className={s.status}>Hãy thêm {show ? "đợt mở bán" : "đêm diễn"} cho sự kiện để chạy mô phỏng.</p>;

  const start = phase.startTime.getTime();
  const end = Math.min(phase.endTime.getTime(), show.startTime.getTime());
  const tiers: Tier[] = [];
  const unavailable: string[] = [];
  for (const zone of zones) {
    const capacity = zone.quotas.find(q => q.showId === show.id)?.capacity;
    const price = zone.prices.find(p => p.phaseId === phase.id);
    if (!capacity) unavailable.push(`${zone.name} (chưa có ghế cho đêm này)`);
    else if (!price) unavailable.push(`${zone.name} (chưa lưu giá cho đợt này)`);
    else if (!(price.floorPrice > 0 && price.floorPrice <= price.basePrice && price.basePrice <= price.ceilingPrice)) {
      unavailable.push(`${zone.name} (cần khung giá dương và hợp lệ)`);
    } else {
      tiers.push({ id: zone.id, name: zone.name, capacity,
        bounds: { floor: price.floorPrice, base: price.basePrice, ceiling: price.ceilingPrice } });
    }
  }
  const seats = tiers.reduce((sum, t) => sum + t.capacity, 0);

  return <>
    <section className={`${s.card} ${css.setup}`}>
      <div className={css.pickers}>
        <div><span className={css.label}>Đêm diễn</span><FilterMenu ariaLabel="Đêm diễn" label={show.name} value={show.id} onPick={setShowId}
          options={shows.map(item => ({ value: item.id, label: item.name }))} /><p className={s.sub}>{date.format(show.startTime)}</p></div>
        <div><span className={css.label}>Đợt mở bán</span><FilterMenu ariaLabel="Đợt mở bán" label={phase.name} value={phase.id} onPick={setPhaseId}
          options={phases.map(item => ({ value: item.id, label: item.name }))} /><p className={s.sub}>{date.format(start)} – {date.format(phase.endTime)}</p></div>
      </div>
      {end > start && <dl className={css.facts}>
        <div><dt>Hạng ghế</dt><dd>{tiers.length}</dd></div>
        <div><dt>Tổng số ghế</dt><dd>{integerFormat.format(seats)}</dd></div>
        <div><dt>Thời gian bán</dt><dd>{days.format((end - start) / hour / 24)} ngày</dd></div>
      </dl>}
    </section>
    {end <= start ? <p className={s.status}>Đêm diễn bắt đầu trước hoặc đúng lúc mở bán. Bạn hãy chọn đợt bán sớm hơn.</p> : <>
      {unavailable.length > 0 && <p className={css.warning}><b>Chưa mô phỏng được:</b> {unavailable.join(", ")}.</p>}
      {tiers.length > 0 ? <TierForecast key={show.id + ":" + phase.id} tiers={tiers} start={start} end={end}
        hoursToShow={(show.startTime.getTime() - end) / hour} /> :
        <p className={s.status}>Chưa có hạng ghế đủ thông tin. Hãy lưu số ghế cho đêm diễn và khung giá cho đợt bán này.</p>}
    </>}
  </>;
}

function TierForecast({ tiers, start, end, hoursToShow }: { tiers: Tier[]; start: number; end: number; hoursToShow: number }) {
  const [request, setRequest] = useState<EventTierInput[] | null>(null);
  const [response, setResponse] = useState<{ request: EventTierInput[]; data: EventResult } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const result = response?.request === request ? response.data : undefined;
  const busy = !!request && !result;
  const phaseDays = (end - start) / hour / 24;

  useEffect(() => {
    if (!request) return;
    let worker: Worker | undefined;
    const fail = () => setResponse({ request, data: { error: "Chưa chạy được mô phỏng. Bạn thử lại nhé." } });
    try {
      worker = new Worker(new URL("./event.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<EventResult>) => {
        setResponse({ request, data });
        worker?.terminate();
      };
      worker.onerror = fail;
      worker.postMessage(request);
    } catch { fail(); }
    return () => worker?.terminate();
  }, [request]);

  function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setRequest(tiers.map(tier => ({
      zoneId: tier.id, capacity: tier.capacity, bounds: tier.bounds,
      dailyDemand: readAmount(form, tier.id), phaseDays, showAfterPhaseHours: hoursToShow, seed: DEFAULT_WHAT_IF.seed,
    })));
  }

  /** copies one figure into every tier, the quickest start when tiers sell alike */
  function fillAll(value: string) {
    for (const tier of tiers) {
      const input = formRef.current?.elements.namedItem(tier.id);
      if (input instanceof HTMLInputElement) input.value = value;
    }
    setRequest(null);
  }

  return <>
    <form ref={formRef} className={s.card} onSubmit={run} onInput={() => setRequest(null)}>
      <div className={s.sectionHead}>
        <div><h2>Dự kiến bán bao nhiêu vé mỗi ngày?</h2>
          <p className={s.sub}>Nhập mức bán trung bình ở giá cơ bản cho từng hạng. Mô phỏng bắt đầu với toàn bộ ghế còn trống và chỉ tính đến hết đợt bán hoặc lúc đêm diễn bắt đầu.</p></div>
        <FillAll onFill={fillAll} />
      </div>
      <div className={css.tiers}>
        <div className={css.tiersHead} aria-hidden="true"><span>Hạng ghế</span><span>Khung giá · sàn – cơ bản – trần</span><span>Vé bán mỗi ngày</span></div>
        {tiers.map(t => <div key={t.id} className={css.tier}>
          <div className={css.tierName}><h3>{t.name}</h3><span>{integerFormat.format(t.capacity)} ghế</span></div>
          <Band bounds={t.bounds} />
          <label className={css.tierInput}><span className={css.hidden}>Vé bán mỗi ngày – {t.name}</span>
            <span className={s.unit}><input type="text" name={t.id} inputMode="decimal" pattern={DECIMAL_PATTERN} placeholder="0" required
              onKeyDown={skipGroupSeparator} onInput={e => groupAmount(e.currentTarget)} /><i>vé/ngày</i></span></label>
        </div>)}
      </div>
      <button type="submit" className={`${s.apply} ${css.run}`} disabled={busy}>{busy ? "Đang tính…" : request && result ? "Chạy lại mô phỏng" : "Chạy mô phỏng"}</button>
    </form>
    {busy && <p className={s.status} role="status"><span className={s.spinner} aria-hidden="true" />Đang mô phỏng 200 lượt cho mỗi hạng…</p>}
    {result && ("error" in result ? <p role="alert" className={s.status}>{result.error}</p> :
      request && <Results rows={result.rows} tiers={tiers} inputs={request} start={start} end={end} />)}
  </>;
}

function FillAll({ onFill }: { onFill: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <div className={css.fill}>
    <label htmlFor="fill-all">Cùng một mức cho mọi hạng</label>
    <div><span className={s.unit}><input id="fill-all" type="text" inputMode="decimal" pattern={DECIMAL_PATTERN} placeholder="Ví dụ: 50" value={value}
      onKeyDown={skipGroupSeparator} onChange={e => { groupAmount(e.currentTarget); setValue(e.currentTarget.value); }} /><i>vé/ngày</i></span>
      <button type="button" disabled={!value} onClick={() => onFill(value)}>Điền</button></div>
  </div>;
}

/** floor, base and ceiling on one short track */
function Band({ bounds }: { bounds: Tier["bounds"] }) {
  const { floor, base, ceiling } = bounds;
  const at = ceiling > floor ? 100 * (base - floor) / (ceiling - floor) : 50;
  return <div className={css.band}>
    <div className={css.bandValues}><span title={money(floor)}>{compactMoney(floor)}</span><span title={money(ceiling)}>{compactMoney(ceiling)}</span>
      {/* sits over its marker, nudged inward near either end so it never runs off the track */}
      <b title={money(base)} style={{ left: `${at}%`, transform: `translateX(-${Math.min(100, Math.max(0, at))}%)` }}>{compactMoney(base)}</b></div>
    <div className={css.bandTrack} aria-hidden="true"><i style={{ left: `${at}%` }} /></div>
  </div>;
}

function Results({ rows, tiers, inputs, start, end }: {
  rows: TierResult[]; tiers: Tier[]; inputs: EventTierInput[]; start: number; end: number;
}) {
  const [selected, setSelected] = useState(0);
  const [tick, setTick] = useState(0);
  const row = rows[selected];
  const point = row.points[tick];
  const last = row.points.length - 1;
  const capacity = tiers[selected].capacity;
  const fixedTotal = rows.reduce((sum, r) => sum + r.fixed, 0);
  const dynamicTotal = rows.reduce((sum, r) => sum + r.dynamic, 0);
  const totalDelta = dynamicTotal - fixedTotal;
  const when = date.format(start + (end - start) * point.tick / phaseTicks(inputs[selected].phaseDays));
  return <>
    <section className={s.card}>
      <h2>So sánh doanh thu</h2>
      <p className={s.sub}>Doanh thu trung bình của 200 lần chạy cho mỗi cách đặt giá.</p>
      <div className={css.totals}>
        <div><span>Giá cố định</span><strong title={money(fixedTotal)}>{compactMoney(fixedTotal)}</strong></div>
        <div className={css.dynamicTotal}><span>Giá động</span><strong title={money(dynamicTotal)}>{compactMoney(dynamicTotal)}</strong></div>
        <div className={`${css.deltaTotal} ${({ up: css.gain, down: css.loss, "": "" })[trend(totalDelta, fixedTotal)]}`}><span>Chênh lệch</span>
          <strong title={money(totalDelta)}>{signed(totalDelta, compactMoney)}</strong>
          {fixedTotal > 0 && <small>{signed(totalDelta / fixedTotal, percent)} doanh thu</small>}</div>
      </div>
      <div className={css.scroll}><table className={`${s.table} ${css.results}`}>
        <thead><tr><th scope="col">Hạng ghế</th><th scope="col">Giá cố định</th><th scope="col">Giá động</th><th scope="col">Chênh lệch</th></tr></thead>
        <tbody>{rows.map((r, i) => {
          const delta = r.dynamic - r.fixed;
          return <tr key={r.zoneId}><th scope="row">{tiers[i].name}</th>
            <td title={money(r.fixed)}>{compactMoney(r.fixed)}</td><td title={money(r.dynamic)}>{compactMoney(r.dynamic)}</td>
            <td title={money(delta)} className={tone(delta, r.fixed)}>{signed(delta, compactMoney)}
              {r.fixed > 0 && <small>{signed(delta / r.fixed, percent)}</small>}</td></tr>;
        })}</tbody>
        <tfoot><tr><th scope="row">Tổng các hạng</th><td title={money(fixedTotal)}>{compactMoney(fixedTotal)}</td><td title={money(dynamicTotal)}>{compactMoney(dynamicTotal)}</td>
          <td title={money(totalDelta)} className={tone(totalDelta, fixedTotal)}>{signed(totalDelta, compactMoney)}</td></tr></tfoot>
      </table></div>
    </section>
    <section className={s.card}>
      <div className={s.sectionHead}><div><h2>Diễn biến theo hạng ghế</h2>
        <p className={s.sub}>Bấm vào biểu đồ hoặc kéo thanh thời gian để xem giá và số vé đã bán trong một lượt mô phỏng.</p></div>
        <FilterMenu ariaLabel="Hạng ghế trên biểu đồ" label={tiers[selected].name} value={String(selected)}
          options={tiers.map((t, i) => ({ value: String(i), label: t.name }))} onPick={v => {
            const next = Number(v);
            setTick(t => Math.min(t, rows[next].points.length - 1));
            setSelected(next);
          }} /></div>
      <div className={`${s.metrics} ${css.metrics}`}>
        <div className={s.metricMain}><span>Giá vé tại mốc chọn</span><strong>{money(point.price)}</strong></div>
        <div><span>Đã bán</span><strong>{integerFormat.format(point.sold)} <small>/ {integerFormat.format(capacity)}</small></strong>
          <meter min={0} max={capacity} value={point.sold} className={s.meter} aria-label="Tỷ lệ đã bán" /></div>
        <div><span>Thời điểm</span><strong className={css.when}>{when}</strong>{point.sold >= capacity && <em className={s.down}>Hết vé</em>}</div>
      </div>
      <TimelineChart kind="price" points={row.points} index={tick} config={inputs[selected]} select={setTick} />
      <TimelineChart kind="sold" points={row.points} index={tick} config={inputs[selected]} select={setTick} />
      <div className={s.player}>
        <div className={s.timeline}>
          <div className={s.scrub}><label htmlFor="tier-time">Thời điểm</label><strong>{when}</strong></div>
          <input id="tier-time" className={s.slider} type="range" min={0} max={last} value={tick} aria-valuetext={when}
            style={{ "--at": `${100 * tick / Math.max(1, last)}%` } as CSSProperties} onChange={e => setTick(Number(e.target.value))} />
        </div>
      </div>
    </section>
  </>;
}
