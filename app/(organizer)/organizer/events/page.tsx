import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { artStyle } from "@/lib/art";
import { placeLabel } from "@/lib/provinces";

const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function initials(name: string) {
  // only words that start with a letter, so "(TP.HCM)" or "–" never become an initial
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default async function OrganizerPage() {
  const events = await prisma.event.findMany({
    orderBy: { startTime: "asc" },
    include: {
      province: true,
      zones: { include: { prices: true } },
      phases: true,
      _count: { select: { shows: true } },
    },
  });

  return (
    <main className="page narrow">
      <div className="page-head">
        <div>
          <h1>Bảng điều khiển</h1>
          <div className="sub">
            Tạo sự kiện, quản lý khu vực ghế và thiết lập giá vé
          </div>
        </div>
        <Link href="/organizer/events/new" className="btn">
          + Tạo sự kiện
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">
          Chưa có sự kiện nào — bấm “Tạo sự kiện” để bắt đầu.
        </div>
      ) : (
        <div className="org-list">
          {events.map((ev) => {
            const zonesNeedingPrice = ev.zones.filter(
              (z) => z.prices.length === 0,
            ).length;
            return (
              <Link
                href={`/organizer/events/${ev.id}`}
                className="org-row"
                key={ev.id}
              >
                <div className="org-art" style={artStyle(ev.imageUrl)}>
                  {!ev.imageUrl && initials(ev.name)}
                </div>
                <div className="org-main">
                  <div className="name">{ev.name}</div>
                  <div className="sub">
                    {dateFmt.format(ev.startTime)} ·{" "}
                    {placeLabel(ev.location, ev.province)}
                  </div>
                </div>
                <div className="org-stats">
                  <span className="pill empty">{ev._count.shows} đêm</span>
                  <span className="pill empty">{ev.zones.length} khu vực</span>
                  <span className="pill empty">{ev.phases.length} đợt</span>
                  {ev.zones.length === 0 ? (
                    <span className="pill bad">Chưa có khu vực</span>
                  ) : zonesNeedingPrice > 0 ? (
                    <span className="pill bad">
                      {zonesNeedingPrice} khu vực chưa có giá
                    </span>
                  ) : (
                    <span className="pill ok">Đã đặt giá</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
