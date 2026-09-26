"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// dates travel as "YYYY-MM-DD" keys so comparisons are plain string compares
// and nothing drifts across timezones
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const longFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function DateRangeModal({
  title = "Chọn khoảng ngày",
  initialFrom,
  initialTo,
  withTime = false,
  initialFromTime = "",
  initialToTime = "",
  onApply,
  onClose,
}: {
  title?: string;
  initialFrom: string;
  initialTo: string;
  /** adds start/end time inputs under the calendar */
  withTime?: boolean;
  initialFromTime?: string;
  initialToTime?: string;
  onApply: (from: string, to: string, fromTime: string, toTime: string) => void;
  onClose: () => void;
}) {
  const todayKey = toKey(new Date());
  const [start, setStart] = useState<string | null>(initialFrom || null);
  const [end, setEnd] = useState<string | null>(initialTo || null);
  const [editing, setEditing] = useState<"start" | "end">(
    initialFrom && !initialTo ? "end" : "start",
  );
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const base = initialFrom ? fromKey(initialFrom) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [fromTime, setFromTime] = useState(initialFromTime);
  const [toTime, setToTime] = useState(initialToTime);
  const dialogRef = useRef<HTMLDivElement>(null);
  // a ref keeps the mount effect from re-running (and re-grabbing focus) when the parent re-renders
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  const weeks = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(
      view.getFullYear(),
      view.getMonth() + 1,
      0,
    ).getDate();
    const count = Math.ceil((offset + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: count }, (_, i) => {
      const d = new Date(view.getFullYear(), view.getMonth(), 1 - offset + i);
      return {
        key: toKey(d),
        day: d.getDate(),
        inMonth: d.getMonth() === view.getMonth(),
      };
    });
    return Array.from({ length: count / 7 }, (_, w) =>
      cells.slice(w * 7, w * 7 + 7),
    );
  }, [view]);

  // while choosing the end date, hovering previews the range
  const rangeEnd =
    end ??
    (editing === "end" && start && hover && hover >= start ? hover : null);

  function pick(key: string) {
    if (editing === "end" && start && key >= start) {
      setEnd(key);
      return;
    }
    // anything else sets the start; an end that no longer follows it is dropped
    setStart(key);
    if (editing === "end" || (end && end < key)) setEnd(null);
    setEditing("end");
  }

  const monthTitle = `Tháng ${view.getMonth() + 1}, ${view.getFullYear()}`;
  const effectiveEnd = end ?? start;
  const timeError =
    withTime &&
    start &&
    effectiveEnd === start &&
    fromTime &&
    toTime &&
    toTime <= fromTime
      ? "Giờ kết thúc phải sau giờ bắt đầu."
      : "";
  const canApply =
    !!start && (!withTime || (!!fromTime && !!toTime)) && !timeError;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dr-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="dr-head">
          <h3 id="dr-title">{title}</h3>
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

        <div className="dr-fields">
          <button
            type="button"
            className={`dr-field ${editing === "start" ? "active" : ""} ${start ? "filled" : ""}`}
            onClick={() => setEditing("start")}
          >
            {start ? longFmt.format(fromKey(start)) : "Ngày bắt đầu"}
          </button>
          <button
            type="button"
            className={`dr-field ${editing === "end" ? "active" : ""} ${end ? "filled" : ""}`}
            onClick={() => start && setEditing("end")}
            disabled={!start}
          >
            {end ? longFmt.format(fromKey(end)) : "Ngày kết thúc"}
          </button>
        </div>

        <div className="dr-body">
          <div className="dr-month">
            <span>{monthTitle}</span>
            <div className="dr-nav">
              <button
                type="button"
                aria-label="Tháng trước"
                onClick={() =>
                  setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
                }
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path
                    d="M15 6l-6 6 6 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Tháng sau"
                onClick={() =>
                  setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
                }
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path
                    d="M9 6l6 6-6 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="dr-grid"
            role="grid"
            aria-label={monthTitle}
            onMouseLeave={() => setHover(null)}
          >
            <div className="dr-row dr-weekdays" role="row">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader">
                  {w}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div className="dr-row" role="row" key={week[0].key}>
                {week.map((c) => {
                  const isStart = c.key === start;
                  const isEnd = c.key === rangeEnd;
                  const between = !!(
                    start &&
                    rangeEnd &&
                    c.key > start &&
                    c.key < rangeEnd
                  );
                  const cls = [
                    "dr-cell",
                    !c.inMonth && "out",
                    c.key === todayKey && "today",
                    between && "between",
                    isStart && rangeEnd && rangeEnd !== start && "band-start",
                    isEnd && start && rangeEnd !== start && "band-end",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div className={cls} role="gridcell" key={c.key}>
                      <button
                        type="button"
                        className={`dr-day ${isStart || isEnd ? "picked" : ""}`}
                        aria-pressed={isStart || isEnd}
                        aria-label={longFmt.format(fromKey(c.key))}
                        onClick={() => pick(c.key)}
                        onMouseEnter={() => setHover(c.key)}
                      >
                        {c.day}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {withTime && (
          <div className="dr-times">
            <label>
              Giờ bắt đầu
              <input
                type="time"
                value={fromTime}
                onChange={(e) => setFromTime(e.target.value)}
              />
            </label>
            <label>
              Giờ kết thúc
              <input
                type="time"
                value={toTime}
                onChange={(e) => setToTime(e.target.value)}
              />
            </label>
            {timeError && (
              <p className="dr-error" role="alert">
                {timeError}
              </p>
            )}
          </div>
        )}

        <div className="dr-foot">
          <button type="button" className="dr-btn ghost" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="dr-btn solid"
            disabled={!canApply}
            onClick={() =>
              start && onApply(start, effectiveEnd ?? start, fromTime, toTime)
            }
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
