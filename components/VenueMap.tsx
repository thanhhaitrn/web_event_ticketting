"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { seatsOf, type Section, type Venue } from "@/lib/venue-layout";

type View = { x: number; y: number; w: number };

// room kept for the caption above and the legend below a focused section, in pixels
const ROOM_TOP = 72;
/** on a phone the caption wraps to two lines */
const ROOM_TOP_NARROW = 100;
const ROOM_BOTTOM = 52;
/** seats are never first shown smaller than this */
const SEAT_PIXELS = 24;

/** where the view settles: the whole drawing, or the focused section at a size its seats can be pressed */
function viewFor(
  focus: { points: string; size: number } | null,
  box: { x: number; y: number; w: number; h: number },
  px: { w: number; h: number },
): View {
  const ratio = px.w / px.h;
  if (!focus) {
    return {
      x: box.x + box.w / 2,
      y: box.y + box.h / 2,
      w: Math.max(box.w, box.h * ratio),
    };
  }
  const corners = focus.points.split(" ").map((p) => p.split(",").map(Number));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const top = px.w < 600 ? ROOM_TOP_NARROW : ROOM_TOP;
  const roomy = Math.max(1, px.h - top - ROOM_BOTTOM);
  const fit = Math.max((x1 - x0) * 1.08, (y1 - y0) * (px.h / roomy) * ratio);
  const w = Math.min(fit, (px.w * focus.size) / SEAT_PIXELS);
  const unit = w / px.w;
  // too big for the box: open on the first seats and let the viewer drag to the rest
  const x = x1 - x0 > w ? x0 + w / 2 - 12 * unit : (x0 + x1) / 2;
  const y =
    y1 - y0 > roomy * unit
      ? y0 - top * unit + w / ratio / 2
      : (y0 + y1) / 2 - ((top - ROOM_BOTTOM) / 2) * unit;
  return { x, y, w };
}

/** the sections of a venue: with a tier chosen, only that tier's sections can be picked; a focused section is zoomed to, with its seats drawn inside it */
export default function VenueMap({
  venue,
  tierId,
  isFull,
  onPick,
  focus,
  seats,
  children,
}: {
  venue: Venue;
  tierId: string | null;
  isFull: (section: Section) => boolean;
  onPick: (section: Section) => void;
  focus: Section | null;
  /** drawn inside the focused section */
  seats?: ReactNode;
  children?: ReactNode;
}) {
  const { box } = venue;
  const centreX = box.x + box.w / 2;
  const centreY = box.y + box.h / 2;
  const boxRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(1.25);
  const [view, setView] = useState<View>({
    x: centreX,
    y: centreY,
    w: Math.max(box.w, box.h * 1.25),
  });
  const viewNow = useRef(view);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const pinch = useRef(0);
  const focused = !!focus;
  const focusPoints = focus?.points ?? null;
  const focusSize = focus ? seatsOf(focus).size : 0;
  // seats need far more zoom than the sections do
  const minW = focused ? box.w / 200 : box.w / 8;

  const fitW = Math.max(box.w, box.h * ratio);

  const clamp = useCallback(
    (v: View): View => {
      const w = Math.min(fitW, Math.max(minW, v.w));
      const h = w / ratio;
      const maxX = Math.max(0, (box.w - w) / 2);
      const maxY = Math.max(0, (box.h - h) / 2);
      return {
        w,
        x: Math.min(centreX + maxX, Math.max(centreX - maxX, v.x)),
        y: Math.min(centreY + maxY, Math.max(centreY - maxY, v.y)),
      };
    },
    [fitW, minW, ratio, box.w, box.h, centreX, centreY],
  );

  const show = useCallback((v: View) => {
    viewNow.current = v;
    setView(v);
  }, []);

  // tracks the box's real shape, so the drawing stays fitted as the window changes
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight > 0) setRatio(el.clientWidth / el.clientHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // glides to the focused section and back out to the whole drawing
  useEffect(() => {
    const el = boxRef.current;
    if (!el || el.clientHeight === 0) return;
    const target = viewFor(
      focusPoints ? { points: focusPoints, size: focusSize } : null,
      { x: box.x, y: box.y, w: box.w, h: box.h },
      { w: el.clientWidth, h: el.clientHeight },
    );
    const start = viewNow.current;
    const instant = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = instant ? 1 : Math.min(1, (now - began) / 450);
      const eased = 1 - (1 - t) ** 3;
      show({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        w: start.w * (target.w / start.w) ** eased,
      });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [focusPoints, focusSize, box.x, box.y, box.w, box.h, ratio, show]);

  const toMap = useCallback((clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    const v = viewNow.current;
    const unit = v.w / r.width;
    return {
      x: v.x + (clientX - r.left - r.width / 2) * unit,
      y: v.y + (clientY - r.top - r.height / 2) * unit,
    };
  }, []);

  /** zooms keeping the point under the cursor in place */
  const zoomAt = useCallback(
    (factor: number, point?: { x: number; y: number }) => {
      const v = viewNow.current;
      const w = Math.min(fitW, Math.max(minW, v.w / factor));
      const applied = v.w / w;
      const p = point ?? { x: v.x, y: v.y };
      show(
        clamp({
          w,
          x: p.x - (p.x - v.x) / applied,
          y: p.y - (p.y - v.y) / applied,
        }),
      );
    },
    [clamp, fitW, minW, show],
  );

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const speed = e.ctrlKey ? 0.01 : 0.002;
      zoomAt(Math.exp(-e.deltaY * speed), toMap(e.clientX, e.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toMap, zoomAt]);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const zoomed = view.w < fitW * 0.98;
  const h = view.w / ratio;

  return (
    <div
      ref={boxRef}
      className={`venue ${zoomed ? "zoomed" : ""} ${venue.dark ? "dark" : ""} ${focused ? "focused" : ""}`}
      onPointerDown={(e) => {
        moved.current = false;
        if ((e.target as Element).closest("button, a")) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) pinch.current = spread();
      }}
      onPointerMove={(e) => {
        const previous = pointers.current.get(e.pointerId);
        if (!previous) return;
        const dx = e.clientX - previous.x;
        const dy = e.clientY - previous.y;
        if (!moved.current && Math.hypot(dx, dy) < 4) return;
        // capture only once it is a drag, so a plain tap still clicks the section under it
        if (!moved.current) e.currentTarget.setPointerCapture(e.pointerId);
        moved.current = true;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const distance = spread();
          const [a, b] = [...pointers.current.values()];
          zoomAt(
            distance / (pinch.current || distance),
            toMap((a.x + b.x) / 2, (a.y + b.y) / 2),
          );
          pinch.current = distance;
        } else {
          const unit =
            viewNow.current.w / e.currentTarget.getBoundingClientRect().width;
          const v = viewNow.current;
          show(clamp({ ...v, x: v.x - dx * unit, y: v.y - dy * unit }));
        }
      }}
      // the end of a drag is not a press on whatever lies under it
      onClickCapture={(e) => {
        if (moved.current) e.stopPropagation();
      }}
      onPointerUp={(e) => pointers.current.delete(e.pointerId)}
      onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
    >
      <svg
        className="venue-svg"
        viewBox={`${view.x - view.w / 2} ${view.y - h / 2} ${view.w} ${h}`}
        role="group"
        aria-label="Sơ đồ khu vực. Chọn một khu để xem ghế."
      >
        {venue.decor.map((d, i) => (
          <g key={i}>
            <polygon className="venue-decor" points={d.points} fill={d.fill} />
            {d.label && (
              <text
                x={d.x}
                y={d.y}
                className={`venue-decor-text ${d.fill === "#111" ? "on-dark" : ""}`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {d.label}
              </text>
            )}
          </g>
        ))}
        {venue.decor.length === 0 && (
          <>
            <ellipse
              className="venue-ground"
              cx={centreX}
              cy={centreY}
              rx={box.w / 2 - 2}
              ry={box.h / 2 - 2}
            />
            <circle
              cx={venue.stage.x}
              cy={venue.stage.y}
              r={62}
              className="venue-stage"
            />
          </>
        )}
        <text
          x={venue.stage.x}
          y={venue.stage.y}
          className="venue-stage-text"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={venue.stage.fontSize}
        >
          {venue.stage.label}
        </text>

        {venue.sections.map((s) => {
          const lit = focus
            ? s.key === focus.key
            : !tierId || s.zoneId === tierId;
          const full = isFull(s);
          const open = lit && !full && !focus;
          const isFocus = s.key === focus?.key;
          return (
            <g key={s.key}>
              <polygon
                points={s.points}
                className={`venue-section ${open ? "open" : ""} ${isFocus ? "focused" : ""}`}
                fill={isFocus ? "#fff" : full ? "#9a9da3" : s.color}
                fillOpacity={lit ? 1 : 0.16}
                style={isFocus ? { stroke: s.color } : undefined}
                role="button"
                tabIndex={open ? 0 : -1}
                aria-disabled={!open}
                aria-label={`${s.zoneName}, ${s.title}${full ? ", hết vé" : ""}`}
                onClick={() => {
                  if (open) onPick(s);
                }}
                onKeyDown={(e) => {
                  if (open && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onPick(s);
                  }
                }}
              >
                <title>{`${s.zoneName} · ${s.title}`}</title>
              </polygon>
              {lit && !isFocus && (
                <text
                  x={s.x}
                  y={s.y}
                  className="venue-label"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={s.fontSize}
                  transform={
                    s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined
                  }
                >
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {seats}
      </svg>

      {children}

      <div className="venue-buttons">
        <button type="button" aria-label="Phóng to" onClick={() => zoomAt(1.5)}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Thu nhỏ"
          disabled={!zoomed}
          onClick={() => zoomAt(1 / 1.5)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
