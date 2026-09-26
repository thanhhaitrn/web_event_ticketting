"use client";

// Static demo: the home page is prerendered once, so search, filters and genre
// picks are read from the URL here in the browser instead of on a server.
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { dateWindow, matchesDate, EVENT_TIME_ZONE } from "@/lib/browse";
import { artStyle } from "@/lib/art";
import { placeLabel } from "@/lib/provinces";
import BrowseFilters from "@/components/BrowseFilters";
import ShowMore from "@/components/ShowMore";
import type { SnapshotEvent } from "@/lib/data";
import type { GenreOption } from "@/lib/genres";

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

// one full row of six before "Xem thêm"
const GRID_CAP = 6;

const FILTERS = [
  { key: "", label: "Tất cả sự kiện" },
  { key: "upcoming", label: "Sắp diễn ra" },
  { key: "selling", label: "Đang mở bán" },
] as const;

// mirrors the server-side query of the database build
function matches(ev: SnapshotEvent, filter: string, query: string, now: Date) {
  if (query) {
    const q = query.toLowerCase();
    const hay = [ev.name, ev.location, ev.province?.name ?? ""];
    if (!hay.some((h) => h.toLowerCase().includes(q))) return false;
  }
  if (filter === "upcoming" && !ev.shows.some((s) => s.startTime >= now))
    return false;
  if (
    filter === "selling" &&
    !ev.phases.some((p) => p.startTime <= now && p.endTime > now)
  )
    return false;
  if (filter === "unpriced" && !ev.zones.some((z) => z.prices.length === 0))
    return false;
  return true;
}

// genre pills are plain links, so they have to carry the other browse params along
function genreHref(params: URLSearchParams, genre: string) {
  const next = new URLSearchParams();
  for (const key of ["q", "filter", "noi", "khi", "tu", "den"]) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  if (genre) next.set("tl", genre);
  const qs = next.toString();
  return qs ? `/?${qs}#kham-pha` : "/#kham-pha";
}

function Sparkle() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.1 5.7L20 10l-5.9 2.3L12 18l-2.1-5.7L4 10l5.9-2.3z" />
    </svg>
  );
}

export type HeroTile = {
  slot: string;
  ev: { id: string; name: string; imageUrl: string | null };
};

type Props = {
  events: SnapshotEvent[];
  artTiles: HeroTile[];
  cities: string[];
  genreRows: GenreOption[];
};

/** reads the live URL; only runs in the browser */
export function HomeFromUrl(props: Props) {
  return <HomeView {...props} search={useSearchParams().toString()} />;
}

/** also prerendered with an empty query, so the static HTML already shows the default page.
 *  `search` is a plain string: URLSearchParams can't cross from the server page to here */
export default function HomeView({
  events: allEvents,
  artTiles,
  cities,
  genreRows,
  search,
}: Props & { search: string }) {
  const router = useRouter();
  const params = new URLSearchParams(search);
  const query = (params.get("q") ?? "").trim();
  const filter = params.get("filter") ?? "";
  // the browse section opens on a default city, the way the reference site opens on yours
  const cityParam = params.get("noi") ?? undefined;
  const when = params.get("khi") ?? "";
  const genrePick = params.get("tl") ?? "";

  const now = new Date();
  const events = allEvents.filter((ev) => matches(ev, filter, query, now));

  const activeLabel =
    FILTERS.find((f) => f.key === filter)?.label ?? "Tất cả sự kiện";

  const defaultCity = cities.includes("Hà Nội") ? "Hà Nội" : (cities[0] ?? "");
  // only names from the province table are honoured; anything else falls back to the default
  const city =
    cityParam === "all"
      ? ""
      : cityParam && cities.includes(cityParam)
        ? cityParam
        : defaultCity;

  const [dateFrom, dateTo] = dateWindow(
    when,
    params.get("tu") ?? "",
    params.get("den") ?? "",
  );
  const nearby = events.filter((ev) => {
    if (city && ev.province?.name !== city) return false;
    if (genrePick && !ev.genres.some((g) => g.slug === genrePick)) return false;
    if (!ev.shows.some((show) => matchesDate(show.startTime, dateFrom, dateTo))) return false;
    return true;
  });

  return (
    <>
      <section className="hero-full">
        <div className="hero-art" aria-hidden="true">
          {artTiles.map(({ slot, ev }) => (
            <div
              className={`tile ${slot}`}
              key={slot}
              style={artStyle(ev.imageUrl)}
            >
              {!ev.imageUrl && initials(ev.name)}
            </div>
          ))}
        </div>

        <div className="hero-inner">
          <h1 className="hero-title">
            <span className="thin">Sự kiện tại</span>
            <span className="bold">Việt Nam</span>
          </h1>

          <form
            className="hero-search"
            role="search"
            onSubmit={(e) => {
              // a static host has no server to receive the form, so search stays in the browser
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
              router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              name="q"
              key={query}
              defaultValue={query}
              placeholder="Tìm theo tên sự kiện hoặc địa điểm"
              aria-label="Tìm sự kiện"
            />
            <button type="submit" className="ask-btn">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Tìm sự kiện
            </button>
          </form>

          <div className="hero-suggest">
            <Link href="/?filter=selling">
              <Sparkle />
              Đang mở bán hôm nay
            </Link>
            <Link href="/?filter=upcoming">
              <Sparkle />
              Lịch diễn sắp tới
            </Link>
            <Link href="/?q=Hà Nội">
              <Sparkle />
              Sự kiện ở Hà Nội
            </Link>
            <Link href="/organizer">
              <Sparkle />
              Tôi là ban tổ chức
            </Link>
          </div>

          <div className="hero-filters">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={f.key ? `/?filter=${f.key}` : "/"}
                className={`chip ${filter === f.key ? "active" : ""}`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <main className="page">
        {events.length === 0 ? (
          <>
            <div className="section-head">
              <h2 className="section-title">
                {query ? `Kết quả cho “${query}”` : activeLabel}
              </h2>
            </div>
            <div className="empty-state">
              {query || filter
                ? "Không có sự kiện nào khớp với lựa chọn này."
                : "Chưa có sự kiện nào — bấm “Tạo sự kiện” để bắt đầu."}
            </div>
          </>
        ) : (
          <ShowMore
            title={query ? `Kết quả cho “${query}”` : activeLabel}
            cap={GRID_CAP}
          >
            {events.map((ev) => (
              <Link
                href={`/events/${ev.id}`}
                key={ev.id}
                className="event-card"
              >
                <div className="art" style={artStyle(ev.imageUrl)}>
                  {!ev.imageUrl && initials(ev.name)}
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
                <div className="name">{ev.name}</div>
                <div className="when">
                  {dateFmt.format(ev.startTime)} •{" "}
                  {timeFmt.format(ev.startTime)}
                </div>
                <div className="loc">{ev.province?.name ?? ev.location}</div>
                <div className="meta">
                  {ev.zones.length} khu vực · {ev.phases.length} đợt mở bán
                </div>
              </Link>
            ))}
          </ShowMore>
        )}

        <section className="browse" id="kham-pha">
          <h2 className="section-title">Concert tại {city || "Việt Nam"}</h2>
          <p className="browse-sub">
            Tìm vé concert, lịch diễn và sự kiện âm nhạc gần {city || "bạn"}
          </p>

          <BrowseFilters cities={cities} city={city} search={search} />

          <div className="browse-label">Khám phá theo thể loại</div>
          <div className="pill-row">
            <Link
              href={genreHref(params, "")}
              className={`chip ${genrePick ? "" : "active"}`}
              scroll={false}
            >
              Tất cả
            </Link>
            {genreRows
              .filter((g) => g.featured)
              .map((g) => (
                <Link
                  key={g.slug}
                  href={genreHref(params, g.slug)}
                  className={`chip ${genrePick === g.slug ? "active" : ""}`}
                  scroll={false}
                >
                  {g.name}
                </Link>
              ))}
          </div>
          {nearby.length === 0 ? (
            <div className="empty-state">
              Không có sự kiện nào khớp với lựa chọn này.
            </div>
          ) : (
            <div className="wide-grid">
              {nearby.map((ev) => {
                const show = ev.shows.find((s) => matchesDate(s.startTime, dateFrom, dateTo))!;
                return (
                  <Link
                    href={`/events/${ev.id}?dem=${show.id}`}
                    key={ev.id}
                    className="wide-card"
                  >
                    <div className="wide-copy">
                      <div className="name">{ev.name}</div>
                      <div className="when">
                        {dateFmt.format(show.startTime)} •{" "}
                        {timeFmt.format(show.startTime)}
                      </div>
                      <div className="loc">
                        {placeLabel(ev.location, ev.province)}
                      </div>
                    </div>
                    <div className="wide-art" style={artStyle(ev.imageUrl)}>
                      {!ev.imageUrl && initials(ev.name)}
                    <span className="badge" aria-hidden="true">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20.8 8.6c0 5-8.8 10.2-8.8 10.2S3.2 13.6 3.2 8.6a4.6 4.6 0 018.8-1.8 4.6 4.6 0 018.8 1.8z" />
                      </svg>
                    </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="hero">
          <div>
            <h2>Bạn đang tổ chức một sự kiện?</h2>
            <Link href="/organizer" className="btn cta">
              Mở trang ban tổ chức
            </Link>
          </div>
          <div>
            <p>
              Ban tổ chức có thể tạo sự kiện, phân chia khu vực ghế và thiết lập
              giá vé cho từng đợt mở bán, đồng thời đặt giá sàn và giá trần để
              AI tự động tối ưu giá trong phạm vi an toàn đã được xác định.
            </p>
            <p>
              Mức giá hiển thị luôn phản ánh giá bán thực tế tại thời điểm hiện
              tại. Mọi thay đổi từ ban tổ chức được lưu trực tiếp vào hệ thống
              và cập nhật ngay đến người mua vé.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
