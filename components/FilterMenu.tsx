"use client";

import { useEffect, useRef, useState } from "react";

export type Option = { value: string; label: string; disabled?: boolean };

function Chevron() {
  return (
    <svg
      className="menu-chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function FilterMenu({
  icon,
  label,
  ariaLabel,
  options,
  value,
  onPick,
}: {
  icon?: React.ReactNode;
  label: string;
  ariaLabel: string;
  options: Option[];
  value: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`filter-box ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span>{label}</span>
        <Chevron />
      </button>
      {open && (
        <div className="menu-pop" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              disabled={o.disabled}
              className={`menu-item ${o.value === value ? "active" : ""} ${o.disabled ? "disabled" : ""}`}
              onClick={() => {
                onPick(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              {o.disabled && <span className="menu-soon">Sắp có</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
