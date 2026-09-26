"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DateRangeModal from "@/components/DateRangeModal";
import FilterMenu, { type Option } from "@/components/FilterMenu";

const DATE_OPTIONS: Option[] = [
  { value: "", label: "Tất cả ngày" },
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
  { value: "range", label: "Chọn ngày" },
];

const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export default function BrowseFilters({
  cities,
  city,
}: {
  cities: string[];
  /** resolved on the server, which defaults to a city when the param is absent */
  city: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const when = params.get("khi") ?? "";
  const from = params.get("tu") ?? "";
  const to = params.get("den") ?? "";

  const [rangeOpen, setRangeOpen] = useState(false);

  // rewrites the given params and keeps the rest of the browse state
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.replace(qs ? `/?${qs}#kham-pha` : "/#kham-pha", { scroll: false });
  }

  const dateLabel =
    when === "range" && (from || to)
      ? `${from ? shortDate(from) : "…"} – ${to ? shortDate(to) : "…"}`
      : (DATE_OPTIONS.find((o) => o.value === when)?.label ?? "Tất cả ngày");

  return (
    <div className="browse-filters">
      <FilterMenu
        ariaLabel="Chọn địa điểm"
        icon={
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="10" r="2.6" />
          </svg>
        }
        label={city || "Toàn quốc"}
        value={city || "all"}
        options={[
          { value: "all", label: "Toàn quốc" },
          ...cities.map((c) => ({ value: c, label: c })),
        ]}
        onPick={(v) => update({ noi: v })}
      />

      <FilterMenu
        ariaLabel="Chọn thời gian"
        icon={
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
        }
        label={dateLabel}
        value={when}
        options={DATE_OPTIONS}
        onPick={(v) => {
          if (v === "range") {
            setRangeOpen(true);
            return;
          }
          update({ khi: v, tu: null, den: null });
        }}
      />

      {rangeOpen && (
        <DateRangeModal
          initialFrom={when === "range" ? from : ""}
          initialTo={when === "range" ? to : ""}
          onClose={() => setRangeOpen(false)}
          onApply={(tu, den) => {
            update({ khi: "range", tu, den });
            setRangeOpen(false);
          }}
        />
      )}

      <span className="filter-divider" aria-hidden="true" />

      <FilterMenu
        ariaLabel="Chọn nghệ sĩ"
        label="Tất cả nghệ sĩ"
        value=""
        options={[
          { value: "", label: "Tất cả nghệ sĩ" },
          // personalised lists need fan accounts, which don't exist yet
          { value: "suggested", label: "Đề xuất", disabled: true },
          { value: "favorites", label: "Yêu thích", disabled: true },
        ]}
        onPick={() => {}}
      />
    </div>
  );
}
