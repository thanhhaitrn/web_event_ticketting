"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ConfirmModal({
  title,
  children,
  confirmLabel,
  busy = false,
  error = "",
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // a ref keeps the mount effect from re-running (and re-grabbing focus) when the parent re-renders
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dr-modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="dr-head">
          <h3 id="confirm-title">{title}</h3>
        </div>
        <div className="confirm-body" id="confirm-body">
          {children}
          {error && (
            <p className="error-note" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dr-foot">
          <button
            type="button"
            className="dr-btn ghost"
            onClick={onClose}
            disabled={busy}
          >
            Huỷ
          </button>
          <button
            type="button"
            className="dr-btn danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Đang xoá…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
