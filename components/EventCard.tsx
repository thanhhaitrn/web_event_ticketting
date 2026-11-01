import Link from "next/link";
import { EVENT_TIME_ZONE } from "@/lib/browse";
import { artStyle } from "@/lib/art";

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function initials(name: string) {
  // only words that start with a letter, so "(TP.HCM)" or "–" never become an initial
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function EventCard({
  event,
}: {
  event: {
    id: string;
    name: string;
    imageUrl: string | null;
    location: string;
    startTime: Date;
    province: { name: string } | null;
    zones: unknown[];
    phases: unknown[];
  };
}) {
  return (
    <Link href={`/events/${event.id}`} className="event-card">
      <div className="art" style={artStyle(event.imageUrl)}>
        {!event.imageUrl && initials(event.name)}
        <span className="badge" aria-hidden="true">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20.8 8.6c0 5-8.8 10.2-8.8 10.2S3.2 13.6 3.2 8.6a4.6 4.6 0 018.8-1.8 4.6 4.6 0 018.8 1.8z" />
          </svg>
        </span>
      </div>
      <div className="name">{event.name}</div>
      <div className="when">
        {dateFmt.format(event.startTime)} • {timeFmt.format(event.startTime)}
      </div>
      <div className="loc">{event.province?.name ?? event.location}</div>
      <div className="meta">
        {event.zones.length} khu vực · {event.phases.length} đợt mở bán
      </div>
    </Link>
  );
}
