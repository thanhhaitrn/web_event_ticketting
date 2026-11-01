"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import type { SeatLayout } from "@/lib/venue-layout";

export type SeatStates = {
  sold: Set<number>;
  held: Set<number>;
  mine: Set<number>;
  picked: Set<number>;
};

const WORDS = {
  sold: "đã bán",
  mine: "bạn đang giữ",
  held: "đang được giữ",
  picked: "bạn đang chọn",
  free: "trống",
};

/** the seats drawn inside their section; one handler on the group, since a section can have 2,000 seats */
export default function SeatLayer({
  layout,
  states,
  ready,
  locked,
  onToggle,
}: {
  layout: SeatLayout;
  states: SeatStates;
  ready: boolean;
  locked: boolean;
  onToggle: (seat: number) => void;
}) {
  const stateOf = (n: number) =>
    states.sold.has(n)
      ? "sold"
      : states.mine.has(n)
        ? "mine"
        : states.held.has(n)
          ? "held"
          : states.picked.has(n)
            ? "picked"
            : "free";

  const press = (e: MouseEvent | KeyboardEvent) => {
    const seat = Number((e.target as Element).getAttribute("data-seat"));
    if (!seat || !ready || locked) return;
    const state = stateOf(seat);
    if (state === "free" || state === "picked") onToggle(seat);
  };

  const fontSize = layout.size * 0.42;
  return (
    <g
      className={`map-seats ${ready && !locked ? "" : "off"}`}
      strokeWidth={layout.size * 0.14}
      onClick={press}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          press(e);
        }
      }}
    >
      {layout.rows.map((row, i) => (
        <text
          key={i}
          x={row.x}
          y={row.y}
          className="map-row-name"
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {row.name}
        </text>
      ))}
      {layout.seats.map((s) => {
        const state = stateOf(s.n);
        const canPress = state === "free" || state === "picked";
        return (
          <g key={s.n}>
            <polygon
              points={s.points}
              data-seat={s.n}
              className={`map-seat ${state}`}
              role="button"
              tabIndex={canPress ? 0 : -1}
              aria-pressed={state === "picked"}
              aria-disabled={!canPress}
              aria-label={`Ghế ${s.label}, ${WORDS[state]}`}
            >
              <title>{`${s.label} · ${WORDS[state]}`}</title>
            </polygon>
            <text
              x={s.x}
              y={s.y}
              className="map-seat-number"
              fontSize={fontSize}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {s.col}
            </text>
          </g>
        );
      })}
    </g>
  );
}
