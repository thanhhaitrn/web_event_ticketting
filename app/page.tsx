import Link from "next/link";
import { prisma } from "@/lib/prisma";

function formatDateRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  const s = start.toLocaleDateString("vi-VN", opts);
  const e = end.toLocaleDateString("vi-VN", opts);
  return s === e ? s : `${s} – ${e}`;
}

export default async function HomePage() {
  const events = await prisma.event.findMany({
    orderBy: { startTime: "asc" },
    include: { zones: true, phases: true },
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sự kiện</h1>
          <div className="sub">Danh sách sự kiện do bạn quản lý</div>
        </div>
        <Link href="/events/new" className="btn">
          + Tạo sự kiện
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          Chưa có sự kiện nào. Bấm &quot;+ Tạo sự kiện&quot; để bắt đầu.
        </div>
      ) : (
        <div className="event-grid">
          {events.map((ev) => (
            <Link href={`/events/${ev.id}`} key={ev.id} className="event-card">
              <div className="name">{ev.name}</div>
              <div className="loc">{ev.location}</div>
              <div className="meta">
                <span>{formatDateRange(ev.startTime, ev.endTime)}</span>
                <span>
                  {ev.zones.length} khu vực ghế · {ev.phases.length} đợt mở bán
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
