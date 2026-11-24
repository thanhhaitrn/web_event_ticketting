"use client";

/**
 * Bộ vẽ biểu đồ SVG dùng cho trang mô phỏng giá: không thư viện ngoài.
 * - Vẽ theo kích thước điểm ảnh thật (ResizeObserver) nên chữ, chấm tròn không bị méo.
 * - Trục có vạch chia "đẹp" (1, 2, 2,5, 5 × 10ⁿ), lưới mờ, đường tham chiếu có nhãn.
 * - Dải ngang theo từng điểm (vd. vùng chết E ± 5%), vùng thời gian (vd. 72 giờ cuối).
 * - Rê chuột: đường dóng + bảng giá trị mọi chuỗi; bấm để chọn thời điểm.
 * - Chú giải bật/tắt từng chuỗi.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import s from "./demo.module.css";

export interface Series {
  id: string;
  label: string;
  values: (number | null)[];
  color: string;
  /** step: bậc thang (giá đổi theo chu kỳ); line: nối thẳng */
  kind?: "step" | "line";
  dash?: string;
  width?: number;
  /** tô vùng dưới đường */
  area?: boolean;
  /** cho phép ẩn/hiện ở chú giải; hiddenByDefault: ẩn lúc đầu */
  toggle?: boolean;
  hiddenByDefault?: boolean;
  /** định dạng riêng trong bảng rê chuột (mặc định dùng yFormat) */
  format?: (v: number) => string;
}

export interface RefLine { y: number; label: string; color?: string; dash?: string }
export interface Band { id: string; label: string; lower: number[]; upper: number[]; color: string; toggle?: boolean; hiddenByDefault?: boolean }
export interface XRegion { from: number; to: number; label: string; color: string }
export interface Marker { index: number; y: number; color: string; dir: "up" | "down"; title?: string }

export interface LineChartProps {
  title: string;
  subtitle?: ReactNode;
  xs: number[];
  series: Series[];
  xFormat: (x: number) => string;
  /** nhãn đầy đủ của trục x trong bảng rê chuột */
  xTooltip?: (x: number, i: number) => string;
  yFormat: (v: number) => string;
  /** miền y cố định; nếu bỏ trống thì tự tính và nới 6% */
  yDomain?: [number, number];
  /** luôn gồm các giá trị này trong miền y (vd. sàn/trần) */
  yInclude?: number[];
  refLines?: RefLine[];
  bands?: Band[];
  regions?: XRegion[];
  markers?: Marker[];
  cursor?: number;
  onSelect?: (index: number) => void;
  height?: number;
  /** dòng thêm cuối bảng rê chuột */
  extraTooltip?: (i: number) => ReactNode;
}

const M = { top: 14, right: 14, bottom: 28, left: 70 };

/** Vạch chia "đẹp" cho khoảng [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi === lo) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step + 0); // + 0 bỏ −0
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function nearest(xs: number[], x: number) {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid; else hi = mid;
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi;
}

export function LineChart(props: LineChartProps) {
  const { title, subtitle, xs, series, xFormat, yFormat, refLines = [], bands = [], regions = [], markers = [],
    cursor, onSelect, height = 220, extraTooltip } = props;
  const [box, width] = useWidth<HTMLDivElement>();
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set([...series, ...bands].filter((x) => x.hiddenByDefault).map((x) => x.id)),
  );
  const [hover, setHover] = useState<number | null>(null);

  const shown = series.filter((x) => !hidden.has(x.id));
  const shownBands = bands.filter((b) => !hidden.has(b.id));
  const W = width;
  const H = height;
  const iw = Math.max(10, W - M.left - M.right);
  const ih = Math.max(10, H - M.top - M.bottom);

  const [y0, y1] = useMemo(() => {
    if (props.yDomain) return props.yDomain;
    const vals: number[] = [...(props.yInclude ?? []), ...refLines.map((r) => r.y)];
    for (const sr of shown) for (const v of sr.values) if (v !== null && Number.isFinite(v)) vals.push(v);
    for (const b of shownBands) vals.push(...b.lower, ...b.upper);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1; }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }, [props.yDomain, props.yInclude, refLines, shown, shownBands]);

  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;
  const X = (x: number) => M.left + (xMax === xMin ? 0 : ((x - xMin) / (xMax - xMin)) * iw);
  const Y = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * ih;
  const yTicks = niceTicks(y0, y1, Math.max(3, Math.round(ih / 42)));
  const xTicks = niceTicks(xMin, xMax, Math.max(2, Math.round(iw / 110)));

  function path(sr: Series) {
    let d = "";
    let open = false;
    sr.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { open = false; return; }
      const px = X(xs[i]).toFixed(1);
      const py = Y(v).toFixed(1);
      if (!open) { d += `M${px},${py}`; open = true; }
      else d += sr.kind === "step" ? `H${px}V${py}` : `L${px},${py}`;
    });
    return d;
  }

  function move(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    if (px < M.left - 4 || px > W - M.right + 4) { setHover(null); return; }
    const x = xMin + ((px - M.left) / iw) * (xMax - xMin);
    setHover(nearest(xs, x));
  }

  const active = hover ?? cursor ?? null;
  const toggles = [...series.filter((x) => x.toggle !== false), ...bands.filter((b) => b.toggle)];
  const tipLeft = active !== null ? X(xs[active]) : 0;
  const flip = tipLeft > W * 0.6;

  return (
    <figure className={s.chart}>
      <figcaption>
        <div>
          <h3>{title}</h3>
          {subtitle && <p className={s.chartSub}>{subtitle}</p>}
        </div>
        <div className={s.chips} role="group" aria-label={`Chuỗi dữ liệu của ${title}`}>
          {toggles.map((x) => {
            const off = hidden.has(x.id);
            const isBand = !("values" in x);
            return (
              <button key={x.id} type="button" className={s.chip} aria-pressed={!off}
                onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })}>
                <i style={isBand ? { background: x.color, height: 10, borderRadius: 3 }
                  : { borderTop: `${(x as Series).width ?? 2.5}px ${(x as Series).dash ? "dashed" : "solid"} ${x.color}` }} />
                {x.label}
              </button>
            );
          })}
          {regions.map((r) => (
            <span key={r.label} className={s.chipStatic}><i style={{ background: r.color, height: 10, borderRadius: 3 }} />{r.label}</span>
          ))}
        </div>
      </figcaption>
      <div ref={box} className={s.chartBox}>
        <svg width={W} height={H} role="img" aria-label={title}
          onPointerMove={move} onPointerLeave={() => setHover(null)}
          onClick={() => { if (hover !== null) onSelect?.(hover); }}
          style={{ cursor: onSelect ? "crosshair" : "default" }}>
          {regions.map((r) => (
            <rect key={r.label} x={X(Math.max(r.from, xMin))} y={M.top} height={ih}
              width={Math.max(0, X(Math.min(r.to, xMax)) - X(Math.max(r.from, xMin)))} style={{ fill: r.color }} />
          ))}
          {yTicks.map((v) => (
            <g key={`y${v}`}>
              <line x1={M.left} x2={W - M.right} y1={Y(v)} y2={Y(v)} className={s.grid} />
              <text x={M.left - 8} y={Y(v)} className={s.tickY}>{yFormat(v)}</text>
            </g>
          ))}
          {xTicks.map((x) => (
            <text key={`x${x}`} x={X(x)} y={H - 8} className={s.tickX}>{xFormat(x)}</text>
          ))}
          <line x1={M.left} x2={W - M.right} y1={M.top + ih} y2={M.top + ih} className={s.axisLine} />
          {shownBands.map((b) => {
            const top = b.upper.map((v, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`).join("");
            const bottom = b.lower.map((v, i) => `L${X(xs[i]).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join("");
            return <path key={b.id} d={`${top}${bottom}Z`} style={{ fill: b.color }} />;
          })}
          {refLines.map((r) => (
            <g key={r.label}>
              <line x1={M.left} x2={W - M.right} y1={Y(r.y)} y2={Y(r.y)}
                style={{ stroke: r.color ?? "#8a8e96", strokeDasharray: r.dash ?? "5 4" }} strokeWidth={1.2} />
              <text x={W - M.right - 4} y={Y(r.y) - 5} className={s.refLabel} style={{ fill: r.color ?? "#6b6f76" }}>{r.label}</text>
            </g>
          ))}
          {shown.filter((sr) => sr.area).map((sr) => {
            const d = path(sr);
            const first = sr.values.findIndex((v) => v !== null && Number.isFinite(v));
            return d && first >= 0 && (
              <path key={`${sr.id}-a`} d={`${d}V${M.top + ih}H${X(xs[first]).toFixed(1)}Z`} style={{ fill: sr.color, opacity: 0.08 }} />
            );
          })}
          {shown.map((sr) => (
            <path key={sr.id} d={path(sr)} fill="none" strokeLinejoin="round"
              style={{ stroke: sr.color, strokeWidth: sr.width ?? 2.5, strokeDasharray: sr.dash }} />
          ))}
          {markers.map((m, i) => {
            const cx = X(xs[m.index]);
            const cy = Y(m.y) + (m.dir === "up" ? -9 : 9);
            const pts = m.dir === "up" ? `${cx - 4},${cy + 3} ${cx + 4},${cy + 3} ${cx},${cy - 3}` : `${cx - 4},${cy - 3} ${cx + 4},${cy - 3} ${cx},${cy + 3}`;
            return <polygon key={i} points={pts} style={{ fill: m.color }}><title>{m.title}</title></polygon>;
          })}
          {active !== null && xs[active] !== undefined && (
            <g pointerEvents="none">
              <line x1={X(xs[active])} x2={X(xs[active])} y1={M.top} y2={M.top + ih} className={hover !== null ? s.hoverLine : s.cursorLine} />
              {shown.map((sr) => {
                const v = sr.values[active];
                return v === null || v === undefined || !Number.isFinite(v) ? null
                  : <circle key={sr.id} cx={X(xs[active])} cy={Y(v)} r={4.5} style={{ fill: "#fff", stroke: sr.color, strokeWidth: 2.5 }} />;
              })}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className={s.tooltip} style={{ left: tipLeft, transform: `translateX(${flip ? "calc(-100% - 12px)" : "12px"})` }}>
            <b>{props.xTooltip ? props.xTooltip(xs[hover], hover) : xFormat(xs[hover])}</b>
            {shown.map((sr) => {
              const v = sr.values[hover];
              return v === null || v === undefined ? null : (
                <span key={sr.id}><i style={{ background: sr.color }} />{sr.label}<em>{(sr.format ?? yFormat)(v)}</em></span>
              );
            })}
            {extraTooltip?.(hover)}
          </div>
        )}
      </div>
    </figure>
  );
}

/** Khoảng P10–P90, trung vị và trung bình của từng nhóm trên một trục chung. */
export function RangeChart({ title, subtitle, rows, format }: {
  title: string;
  subtitle?: ReactNode;
  rows: { label: string; color: string; p10: number; p50: number; p90: number; mean: number }[];
  format: (v: number) => string;
}) {
  const [box, width] = useWidth<HTMLDivElement>();
  const lo = Math.min(...rows.map((r) => r.p10));
  const hi = Math.max(...rows.map((r) => r.p90));
  const pad = (hi - lo || hi * 0.05 || 1) * 0.12;
  const a = lo - pad;
  const b = hi + pad;
  const left = 96;
  const right = 16;
  const iw = Math.max(10, width - left - right);
  const X = (v: number) => left + ((v - a) / (b - a)) * iw;
  const rowH = 46;
  const H = rows.length * rowH + 34;
  const ticks = niceTicks(a, b, Math.max(2, Math.round(iw / 120)));
  return (
    <figure className={s.chart}>
      <figcaption><div><h3>{title}</h3>{subtitle && <p className={s.chartSub}>{subtitle}</p>}</div></figcaption>
      <div ref={box} className={s.chartBox}>
        <svg width={width} height={H} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={6} y2={H - 26} className={s.grid} />
              <text x={X(t)} y={H - 8} className={s.tickX}>{format(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = 12 + i * rowH + rowH / 2 - 6;
            return (
              <g key={r.label}>
                <text x={left - 10} y={cy} className={s.tickY} style={{ fontWeight: 700, fill: "var(--ink)" }}>{r.label}</text>
                <rect x={X(r.p10)} y={cy - 9} width={Math.max(2, X(r.p90) - X(r.p10))} height={18} rx={9} style={{ fill: r.color, opacity: 0.22 }} />
                <line x1={X(r.p50)} x2={X(r.p50)} y1={cy - 12} y2={cy + 12} style={{ stroke: r.color, strokeWidth: 3 }} />
                <circle cx={X(r.mean)} cy={cy} r={4} style={{ fill: "#fff", stroke: r.color, strokeWidth: 2 }} />
                <title>{`${r.label}: P10 ${format(r.p10)} · trung vị ${format(r.p50)} · P90 ${format(r.p90)} · trung bình ${format(r.mean)}`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
