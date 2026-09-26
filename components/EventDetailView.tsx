"use client";

// Static demo: the page HTML is built once per event, so the night picker (?dem=)
// and the "selling now" state are worked out here in the browser.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { saleSummary } from "@/lib/sales";
import { EVENT_TIME_ZONE } from "@/lib/browse";
import { artStyle } from "@/lib/art";
import { placeLabel } from "@/lib/provinces";
import type { SnapshotEvent } from "@/lib/data";

const moneyFmt = new Intl.NumberFormat("vi-VN");
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const nightFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

function seatsFor(
  zone: { quotas: { showId: string; capacity: number }[] },
  showId: string,
) {
  return zone.quotas.find((q) => q.showId === showId)?.capacity ?? 0;
}

function initials(name: string) {
  // only words that start with a letter, so "(TP.HCM)" or "–" never become an initial
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** reads ?dem= from the live URL; only runs in the browser */
export function EventDetailFromUrl({ event }: { event: SnapshotEvent }) {
  return <EventDetailView event={event} dem={useSearchParams().get("dem")} />;
}

export default function EventDetailView({
  event,
  dem,
}: {
  event: SnapshotEvent;
  dem: string | null;
}) {
  const now = new Date();
  const { phase: activePhase, isSelling: isSellingNow, isUpcoming, label } = saleSummary(event.phases, now);

  // ?dem=<show id> picks the night; anything else falls back to the first one
  const night = event.shows.find((s) => s.id === dem) ?? event.shows.find((s) => s.endTime > now) ?? event.shows[0] ?? null;

  const priced = activePhase
    ? event.zones
        .map((z) => ({
          zone: z,
          price: z.prices.find((p) => p.phaseId === activePhase.id),
        }))
        .filter((r) => r.price)
    : [];
  // a zone with no tickets on the chosen night isn't sold that night
  const rows = night
    ? priced
        .map((r) => ({ ...r, seats: seatsFor(r.zone, night.id) }))
        .filter((r) => r.seats > 0)
    : [];

  return (
    <main className="page narrow">
      <Link href="/" className="back-link">
        ← Tất cả sự kiện
      </Link>

      <div className="detail-head">
        <div className="detail-art" style={artStyle(event.imageUrl)}>
          {!event.imageUrl && initials(event.name)}
        </div>
        <div className="detail-info">
          <h1>{event.name}</h1>
          <div className="detail-meta">
            {event.shows.length > 1 ? (
              event.shows.map((show) => (
                <div key={show.id}>
                  {show.name} · {dateTimeFmt.format(show.startTime)}
                </div>
              ))
            ) : (
              <div>{dateTimeFmt.format(event.startTime)}</div>
            )}
            <div>{placeLabel(event.location, event.province)}</div>
          </div>
          {activePhase && (
            <span
              className={`pill ${isSellingNow ? "ok" : isUpcoming ? "empty" : "bad"}`}
            >
              {label}
            </span>
          )}
        </div>
      </div>

      {!activePhase || priced.length === 0 ? (
        <div className="empty-state">Sự kiện chưa công bố giá vé.</div>
      ) : (
        <>
          <div className="section-head">
            <h2>Giá vé — {activePhase.name}</h2>
          </div>
          <div className="sub" style={{ marginTop: -18 }}>
            {isSellingNow
              ? `Mở bán đến ${dateFmt.format(activePhase.endTime)}`
              : isUpcoming
                ? `Mở bán từ ${dateFmt.format(activePhase.startTime)}`
                : `Đã đóng ngày ${dateFmt.format(activePhase.endTime)}`}
          </div>

          {event.shows.length > 1 && (
            <nav className="night-toggle" aria-label="Chọn đêm diễn">
              {event.shows.map((show) => {
                const active = show.id === night?.id;
                return (
                  <Link
                    key={show.id}
                    href={`/events/${event.id}?dem=${show.id}`}
                    replace
                    scroll={false}
                    className={`night-opt ${active ? "active" : ""}`}
                    aria-current={active ? "true" : undefined}
                  >
                    <span className="night-name">{show.name}</span>
                    <span className="night-date">
                      {nightFmt.format(show.startTime)}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

          {rows.length === 0 ? (
            <div className="empty-state">
              {night?.name ?? "Đêm này"} chưa có vé được mở bán.
            </div>
          ) : (
            <div className="ticket-list">
              {rows.map(({ zone, price, seats }) => (
                <div className="ticket-row" key={zone.id}>
                  <div>
                    <div className="zone-name">{zone.name}</div>
                    <div className="zone-seats">
                      {moneyFmt.format(seats)} chỗ
                    </div>
                  </div>
                  <div className="ticket-price num">
                    {moneyFmt.format(price!.basePrice)} ₫
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="note">
            Giá hiển thị là giá vé cơ bản của đợt mở bán này. Khi ban tổ chức
            bật định giá động ở giai đoạn sau, giá có thể thay đổi theo nhu cầu
            thực tế nhưng luôn nằm trong biên an toàn đã được cấu hình.
          </div>
        </>
      )}
    </main>
  );
}
