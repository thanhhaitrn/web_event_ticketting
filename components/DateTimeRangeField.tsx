"use client";

import { useState } from "react";
import DateRangeModal from "@/components/DateRangeModal";

// values are the "YYYY-MM-DDTHH:mm" strings the event API already accepts
const split = (v: string) => (v ? v.split("T") : ["", ""]);

function display(from: string, to: string) {
  const [fd, ft] = split(from);
  const [td, tt] = split(to);
  const dmy = (d: string) => d.split("-").reverse().join("/");
  if (fd === td) return `${dmy(fd)} · ${ft} – ${tt}`;
  return `${dmy(fd)}, ${ft} → ${dmy(td)}, ${tt}`;
}

export default function DateTimeRangeField({
  id,
  label,
  modalTitle,
  from,
  to,
  defaultFromTime,
  defaultToTime,
  onChange,
}: {
  id: string;
  label: string;
  modalTitle: string;
  from: string;
  to: string;
  defaultFromTime: string;
  defaultToTime: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fd, ft] = split(from);
  const [td, tt] = split(to);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <button
        id={id}
        type="button"
        className={`field-trigger ${from && to ? "filled" : ""}`}
        onClick={() => setOpen(true)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
        </svg>
        <span>{from && to ? display(from, to) : "Chọn ngày và giờ"}</span>
      </button>

      {open && (
        <DateRangeModal
          title={modalTitle}
          withTime
          initialFrom={fd}
          initialTo={td}
          initialFromTime={ft || defaultFromTime}
          initialToTime={tt || defaultToTime}
          onClose={() => setOpen(false)}
          onApply={(f, t, fTime, tTime) => {
            onChange(`${f}T${fTime}`, `${t}T${tTime}`);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
