"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// every image box on the site is square, so the crop is fixed at 1:1
const OUTPUT_SIZE = 1080;
const MAX_ZOOM = 4;

type Size = { w: number; h: number };

export default function ImageCropModal({
  src,
  onApply,
  onClose,
}: {
  src: string;
  onApply: (blob: Blob) => void;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  // a ref keeps the mount effect from re-running (and re-grabbing focus) when the parent re-renders
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [natural, setNatural] = useState<Size | null>(null);
  const [frame, setFrame] = useState(320);
  const [zoom, setZoom] = useState(1);
  // offset of the image centre from the frame centre, in frame pixels
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrame(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // zoom 1 means the image just covers the frame
  const scale = natural ? (frame / Math.min(natural.w, natural.h)) * zoom : 1;
  const shown = natural
    ? { w: natural.w * scale, h: natural.h * scale }
    : { w: frame, h: frame };

  // keeps the frame fully covered, so the crop never shows empty space
  function clamp(o: { x: number; y: number }, w = shown.w, h = shown.h) {
    const mx = Math.max(0, (w - frame) / 2);
    const my = Math.max(0, (h - frame) / 2);
    return {
      x: Math.min(mx, Math.max(-mx, o.x)),
      y: Math.min(my, Math.max(-my, o.y)),
    };
  }

  function setZoomClamped(z: number) {
    if (!natural) return;
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const s = (frame / Math.min(natural.w, natural.h)) * next;
    setZoom(next);
    setOffset((o) => clamp(o, natural.w * s, natural.h * s));
  }

  async function apply() {
    const img = imgRef.current;
    if (!img || !natural) return;
    setSaving(true);
    const left = frame / 2 + offset.x - shown.w / 2;
    const top = frame / 2 + offset.y - shown.h / 2;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setSaving(false);
      return;
    }
    // JPEG has no transparency, so transparent PNG areas become white instead of black
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      -left / scale,
      -top / scale,
      frame / scale,
      frame / scale,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );
    canvas.toBlob(
      (blob) => {
        setSaving(false);
        if (blob) onApply(blob);
      },
      "image/jpeg",
      0.9,
    );
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dr-modal crop-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="dr-head">
          <h3 id="crop-title">Cắt ảnh theo khung</h3>
          <button
            type="button"
            className="dr-close"
            aria-label="Đóng"
            onClick={onClose}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="crop-body">
          <div
            ref={frameRef}
            className="crop-frame"
            tabIndex={0}
            aria-label="Khung cắt ảnh, kéo hoặc dùng phím mũi tên để di chuyển"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                x: e.clientX,
                y: e.clientY,
                ox: offset.x,
                oy: offset.y,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              setOffset(
                clamp({
                  x: d.ox + e.clientX - d.x,
                  y: d.oy + e.clientY - d.y,
                }),
              );
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.002)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 20 : 5;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [step, 0],
                ArrowRight: [-step, 0],
                ArrowUp: [0, step],
                ArrowDown: [0, -step],
              };
              const m = moves[e.key];
              if (!m) return;
              e.preventDefault();
              setOffset((o) => clamp({ x: o.x + m[0], y: o.y + m[1] }));
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local file being cropped */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  w: e.currentTarget.naturalWidth,
                  h: e.currentTarget.naturalHeight,
                })
              }
              style={{
                width: shown.w,
                height: shown.h,
                transform: `translate(${offset.x - shown.w / 2}px, ${offset.y - shown.h / 2}px)`,
                visibility: natural ? "visible" : "hidden",
              }}
            />
          </div>

          <label className="crop-zoom">
            <span>Thu phóng</span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoomClamped(Number(e.target.value))}
            />
          </label>
          <p className="crop-hint">
            Kéo ảnh để chọn phần hiển thị. Khung vuông này giống các thẻ sự kiện
            trên trang.
          </p>
        </div>

        <div className="dr-foot">
          <button type="button" className="dr-btn ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="dr-btn solid"
            disabled={!natural || saving}
            onClick={apply}
          >
            {saving ? "Đang xử lý…" : "Cắt và tải lên"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
