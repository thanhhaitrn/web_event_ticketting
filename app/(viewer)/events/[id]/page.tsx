import { publicShowPrices } from "@/lib/pricing-copilot/public-show-prices";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import Link from "next/link";
import { saleSummary } from "@/lib/sales";
import { listedTicketPrices } from "@/lib/listed-ticket-prices";
import { EVENT_TIME_ZONE } from "@/lib/browse";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { artStyle } from "@/lib/art";

const moneyFmt = new Intl.NumberFormat("vi-VN");
const longDateFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
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

export default async function PublicEventPage({
  params,
  searchParams,
}: PageProps<"/events/[id]">) {
  const { id } = await params;
  const { dem } = await searchParams;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      province: true,
      artists: { orderBy: { createdAt: "asc" } },
      zones: {
        orderBy: { createdAt: "asc" },
        include: { prices: true, quotas: true },
      },
      phases: { orderBy: { startTime: "asc" } },
      shows: { orderBy: { startTime: "asc" } },
    },
  });

  if (!event) notFound();

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
  const listed = listedTicketPrices(event, activePhase ?? null);
  const referenceOnly = listed.length > 0;
  const rows = night
    ? priced
        .map((r) => ({ ...r, seats: seatsFor(r.zone, night.id) }))
        .filter((r) => referenceOnly || r.seats > 0)
    : [];

  const live = night && isSellingNow && rows.some(({ price }) => price?.dynamicEnabled)
    ? await publicShowPrices(night.id, now)
    : null;
  const views = new Map(live?.zones.filter((zone) => zone.dynamic).map((zone) => [zone.zoneId, zone]));

  return (
    <>
    <section className="event-hero">
      <div className="event-hero-inner">
        <div className="event-hero-copy">
          <div className="event-eyebrow">
            <span>Concert</span>
            {activePhase && !referenceOnly && (
              <span
                className={`pill ${isSellingNow ? "ok" : isUpcoming ? "empty" : "bad"}`}
              >
                {label}
              </span>
            )}
          </div>
          <h1>{event.name}</h1>

          <div className="event-facts">
            <div className="event-fact">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
                <circle cx="12" cy="10" r="2.6" />
              </svg>
              <div>
                <b>{event.location}</b>
                {event.province && <span>{event.province.name}</span>}
              </div>
            </div>
            <div className="event-fact">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="15" rx="3" />
                <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
              </svg>
              <div className="event-nights">
                {event.shows.map((show) => (
                  <div key={show.id}>
                    <b>{longDateFmt.format(show.startTime)}</b>
                    <span>
                      {event.shows.length > 1 && `${show.name} · `}
                      {timeFmt.format(show.startTime)}{referenceOnly && ` – ${timeFmt.format(show.endTime)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="event-actions">
            {rows.length > 0 && (
              <a href="#gia-ve" className="btn ghost event-btn">
                Xem giá vé
              </a>
            )}
            {isSellingNow && !referenceOnly && rows.length > 0 && night && night.endTime > now && (
              <Link
                href={`/events/${event.id}/seats?dem=${night.id}`}
                className="btn event-btn"
              >
                Mua vé
              </Link>
            )}
          </div>

          {event.artists.length === 1 && (
            <Link href={`/artists/${event.artists[0].slug}`} className="event-all">
              Xem tất cả sự kiện của nghệ sĩ này
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          {event.artists.length > 1 && (
            <div className="event-artists">
              <span>Nghệ sĩ:</span>
              {event.artists.map((a) => (
                <Link key={a.id} href={`/artists/${a.slug}`}>
                  {a.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="event-poster" style={artStyle(event.imageUrl)}>
          {!event.imageUrl && initials(event.name)}
        </div>
      </div>
    </section>

    <main className="page narrow" id="gia-ve">
      {!activePhase || priced.length === 0 ? (
        <div className="empty-state">Sự kiện chưa công bố giá vé.</div>
      ) : (
        <>
          <div className="section-head">
            <h2>{referenceOnly ? "Giá vé niêm yết" : `Giá vé — ${activePhase.name}`}</h2>
            {event.seatMapUrl && (
              <a href={event.seatMapUrl} className="btn ghost" target="_blank" rel="noreferrer">
                Xem sơ đồ khu vực
              </a>
            )}
          </div>
          <div className="sub" style={{ marginTop: -18 }}>
            {referenceOnly ? "Bạn có thể xem giá từng hạng bên dưới. Venu chưa mở bán vé cho đêm diễn này." : isSellingNow
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
                views.has(zone.id) ? (
                  <PriceHistoryChart key={zone.id} view={views.get(zone.id)!} zoneName={zone.name} />
                ) : <div className="ticket-row" key={zone.id}>
                  <div>
                    <div className="zone-name">{zone.name}</div>
                    {!referenceOnly && <div className="zone-seats">
                      {moneyFmt.format(seats)} chỗ
                    </div>}
                  </div>
                  <div className="ticket-price num">
                    {moneyFmt.format(price!.basePrice)} ₫
                  </div>
                </div>
              ))}
            </div>
          )}

          {views.size > 0 && (
            <div className="note">Giá được cố định khi giữ ghế thành công và áp dụng đến khi hết hạn giữ ghế.</div>
          )}
        </>
      )}
    </main>
    </>
  );
}
