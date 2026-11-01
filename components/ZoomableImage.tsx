"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const BUTTON_STEP = 1.5;

type View = { scale: number; x: number; y: number };
const FIT: View = { scale: 1, x: 0, y: 0 };

export default function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [dragging, setDragging] = useState(false);
  // fingers or mouse currently down, by pointer id
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const gestureStart = useRef(1);

  /** keeps the picture covering as much of the box as it can: it never drifts out of view */
  const clamp = useCallback((v: View): View => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img?.naturalWidth) return v;
    const fit = Math.min(box.clientWidth / img.naturalWidth, box.clientHeight / img.naturalHeight);
    const maxX = Math.max(0, (img.naturalWidth * fit * v.scale - box.clientWidth) / 2);
    const maxY = Math.max(0, (img.naturalHeight * fit * v.scale - box.clientHeight) / 2);
    return {
      scale: v.scale,
      x: Math.min(maxX, Math.max(-maxX, v.x)),
      y: Math.min(maxY, Math.max(-maxY, v.y)),
    };
  }, []);

  /** zooms around a point given in px from the box centre, so that point stays under the cursor */
  const zoomTo = useCallback(
    (next: (scale: number) => number, px = 0, py = 0) => {
      setView((v) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next(v.scale)));
        const ratio = scale / v.scale;
        return clamp({ scale, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio });
      });
    },
    [clamp],
  );

  const fromCentre = useCallback((clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return [clientX - r.left - r.width / 2, clientY - r.top - r.height / 2] as const;
  }, []);

  // these need preventDefault, which React's own wheel handler can't do
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [px, py] = fromCentre(e.clientX, e.clientY);
      // trackpad pinch arrives as ctrl+wheel with much smaller deltas
      const speed = e.ctrlKey ? 0.01 : 0.002;
      zoomTo((s) => s * Math.exp(-e.deltaY * speed), px, py);
    };
    // Safari reports trackpad pinch as its own gesture events
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      setView((v) => {
        gestureStart.current = v.scale;
        return v;
      });
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture;
      const [px, py] = fromCentre(g.clientX, g.clientY);
      zoomTo(() => gestureStart.current * g.scale, px, py);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("gesturestart", onGestureStart);
    box.addEventListener("gesturechange", onGestureChange);
    return () => {
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("gesturestart", onGestureStart);
      box.removeEventListener("gesturechange", onGestureChange);
    };
  }, [fromCentre, zoomTo]);

  // a resized window can leave the picture out of bounds
  useEffect(() => {
    const onResize = () => setView((v) => clamp(v));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const zoomed = view.scale > 1;

  return (
    <div
      ref={boxRef}
      className={`zoom-box ${zoomed ? "zoomed" : ""} ${dragging ? "dragging" : ""}`}
      tabIndex={0}
      role="group"
      aria-label={`${alt}. Dùng phím cộng, trừ để phóng to, thu nhỏ và phím mũi tên để di chuyển`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) pinchDistance.current = spread();
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const previous = pointers.current.get(e.pointerId);
        if (!previous) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          const distance = spread();
          const [a, b] = [...pointers.current.values()];
          const [px, py] = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
          const ratio = distance / (pinchDistance.current || distance);
          pinchDistance.current = distance;
          zoomTo((s) => s * ratio, px, py);
        } else {
          const dx = e.clientX - previous.x;
          const dy = e.clientY - previous.y;
          setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) setDragging(false);
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) setDragging(false);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        if (zoomed) {
          setView(FIT);
        } else {
          const [px, py] = fromCentre(e.clientX, e.clientY);
          zoomTo(() => 2.5, px, py);
        }
      }}
      onKeyDown={(e) => {
        const pan: Record<string, [number, number]> = {
          ArrowLeft: [60, 0],
          ArrowRight: [-60, 0],
          ArrowUp: [0, 60],
          ArrowDown: [0, -60],
        };
        if (e.key === "+" || e.key === "=") zoomTo((s) => s * BUTTON_STEP);
        else if (e.key === "-") zoomTo((s) => s / BUTTON_STEP);
        else if (e.key === "0") setView(FIT);
        else if (pan[e.key] && zoomed) {
          const [dx, dy] = pan[e.key];
          setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
        } else return;
        e.preventDefault();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- organizer upload, any size */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="zoom-img"
        draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      />
      <div className="zoom-controls">
        <button
          type="button"
          aria-label="Thu nhỏ"
          disabled={view.scale <= MIN_SCALE}
          onClick={() => zoomTo((s) => s / BUTTON_STEP)}
        >
          −
        </button>
        <button
          type="button"
          className="zoom-level"
          aria-label="Về kích thước ban đầu"
          title="Về kích thước ban đầu"
          disabled={!zoomed}
          onClick={() => setView(FIT)}
        >
          {Math.round(view.scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="Phóng to"
          disabled={view.scale >= MAX_SCALE}
          onClick={() => zoomTo((s) => s * BUTTON_STEP)}
        >
          +
        </button>
      </div>
    </div>
  );
}
