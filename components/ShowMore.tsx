"use client";

import { Children, useState } from "react";

// caps the grid until the reader asks for the rest, so the section stays short
// now and still grows on its own as more events are added
export default function ShowMore({
  title,
  cap,
  children,
}: {
  title: string;
  cap: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hasMore = items.length > cap;
  const shown = expanded || !hasMore ? items : items.slice(0, cap);

  return (
    <>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {hasMore && (
          <button
            type="button"
            className="link-all"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
              style={{
                transform: expanded ? "rotate(-90deg)" : "rotate(90deg)",
              }}
            >
              <path
                d="M4 12h15M13 6l6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="event-grid">{shown}</div>
    </>
  );
}
