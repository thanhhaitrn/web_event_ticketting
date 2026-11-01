import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { artStyle } from "@/lib/art";
import { EVENT_TIME_ZONE } from "@/lib/browse";
import { initials } from "@/components/EventCard";

const dateParts = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

type Night = {
  id: string;
  eventId: string;
  eventName: string;
  place: string;
  showName: string;
  manyNights: boolean;
  startTime: Date;
};

function NightRow({ night, past }: { night: Night; past?: boolean }) {
  const parts = dateParts.formatToParts(night.startTime);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return (
    <li className="artist-row">
      <div className={`date-tile ${past ? "past" : ""}`}>
        <span>Thg {part("month")}</span>
        <b>{part("day")}</b>
        <span>{part("weekday")}</span>
      </div>
      <div className="artist-row-copy">
        <div className="artist-row-name">{night.eventName}</div>
        <div className="artist-row-place">
          {night.place} · {night.manyNights && `${night.showName} · `}
          {timeFmt.format(night.startTime)}
        </div>
      </div>
      <Link
        href={`/events/${night.eventId}?dem=${night.id}`}
        className={`btn ${past ? "ghost" : ""}`}
      >
        {past ? "Xem chi tiết" : "Xem vé"}
      </Link>
    </li>
  );
}

// /artists/<slug>: every night of every event this artist plays
export default async function ArtistPage({ params }: PageProps<"/artists/[slug]">) {
  const { slug } = await params;

  const artist = await prisma.artist.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { startTime: "asc" },
        include: { province: true, shows: { orderBy: { startTime: "asc" } } },
      },
    },
  });
  if (!artist) notFound();
  const events = artist.events;

  const now = new Date();
  const nights = events
    .flatMap((ev) =>
      ev.shows.map((show) => ({
        id: show.id,
        eventId: ev.id,
        eventName: ev.name,
        place: [ev.location, ev.province?.name].filter(Boolean).join(", "),
        showName: show.name,
        manyNights: ev.shows.length > 1,
        startTime: show.startTime,
        endTime: show.endTime,
      })),
    )
    .sort((a, b) => +a.startTime - +b.startTime);
  const upcoming = nights.filter((n) => n.endTime > now);
  const past = nights.filter((n) => n.endTime <= now).reverse();

  // their own photo, else the poster of their next (or latest) event
  const portrait =
    artist.imageUrl ??
    events.find((e) => e.imageUrl && e.endTime > now)?.imageUrl ??
    [...events].reverse().find((e) => e.imageUrl)?.imageUrl;

  return (
    <>
      <section className="artist-hero">
        <div className="artist-hero-inner">
          <div className="artist-portrait" style={artStyle(portrait)}>
            {!portrait && initials(artist.name)}
          </div>
          <div className="artist-hero-copy">
            <div className="artist-eyebrow">Nghệ sĩ</div>
            <h1>{artist.name}</h1>
            {upcoming.length > 0 && <span className="artist-badge">Đang có lịch diễn</span>}
            <div className="artist-stats">
              {upcoming.length} đêm diễn sắp tới
            </div>
          </div>
        </div>
      </section>

      <main className="page artist-page">
        <section className="artist-section">
          <h2 className="section-title">Lịch diễn sắp tới</h2>
          {upcoming.length === 0 ? (
            <div className="empty-state">Nghệ sĩ này chưa có lịch diễn sắp tới.</div>
          ) : (
            <ul className="artist-rows">
              {upcoming.map((n) => (
                <NightRow key={n.id} night={n} />
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="artist-section">
            <h2 className="section-title">Đã diễn ra</h2>
            <ul className="artist-rows">
              {past.map((n) => (
                <NightRow key={n.id} night={n} past />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
