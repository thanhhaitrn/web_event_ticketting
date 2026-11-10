"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SeatLayer from "@/components/SeatLayer";
import VenueMap from "@/components/VenueMap";
import ZoomableImage from "@/components/ZoomableImage";
import { artStyle } from "@/lib/art";
import { MAX_SEATS_PER_ORDER } from "@/lib/seat-layout";
import type { OrderView, SeatMapStatus } from "@/lib/seat-service";
import {
  buildVenue,
  seatName,
  seatsOf,
  sectionFull,
  type Section,
  type Venue,
  type VenueZone,
} from "@/lib/venue-layout";

export type PickerZone = VenueZone;
export type PickerNight = { id: string; name: string; when: string };

const POLL_MS = 2000;
const money = new Intl.NumberFormat("vi-VN");

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function SeatPicker({
  eventId,
  eventName,
  imageUrl,
  venueName,
  seatMapUrl,
  venuePlan,
  night,
  nights,
  zones,
  initialZoneId,
}: {
  eventId: string;
  eventName: string;
  imageUrl: string | null;
  venueName: string;
  seatMapUrl: string | null;
  venuePlan: string | null;
  night: PickerNight;
  nights: PickerNight[];
  zones: PickerZone[];
  initialZoneId: string | null;
}) {
  const showId = night.id;
  const venue = useMemo(() => buildVenue(zones, venuePlan), [zones, venuePlan]);

  // the steps: original map → sections of the chosen tier → seats of the chosen section
  const [zoneId, setZoneId] = useState<string | null>(initialZoneId);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<SeatMapStatus | null>(null);
  const [left, setLeft] = useState<Record<string, number>>({});
  const [takenByRow, setTakenByRow] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [paid, setPaid] = useState<OrderView | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // shown on the map, where the viewer's eyes are when they press a sixth seat
  const [overLimit, setOverLimit] = useState(false);
  const limitTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(limitTimer.current), []);

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const active = venue.sections.find((s) => s.key === activeKey) ?? null;
  const from = active?.first ?? 0;
  const to = active?.last ?? -1;
  const activeZoneId = active?.zoneId;

  // ignores an answer that arrives after the viewer has moved to another section
  const viewKey = useRef<string | null>(null);
  const selectedNow = useRef(selected);
  useEffect(() => {
    viewKey.current = activeKey;
    selectedNow.current = selected;
  });

  const refresh = useCallback(async () => {
    const available = await fetch(
      `/api/seats/availability?showId=${encodeURIComponent(showId)}`,
      {
        cache: "no-store",
      },
    ).catch(() => null);
    if (available?.ok) {
      const data = await available.json();
      setLeft(data.zones);
      setTakenByRow(data.taken);
    }
    if (!activeKey || !activeZoneId) return;

    const q = new URLSearchParams({
      showId,
      zoneId: activeZoneId,
      from: String(from),
      to: String(to),
    });
    const res = await fetch(`/api/seats?${q}`, { cache: "no-store" }).catch(
      () => null,
    );
    if (!res?.ok || viewKey.current !== activeKey) return;
    const next: SeatMapStatus = await res.json();
    setStatus(next);
    // a seat in the basket that someone else just took can't stay selected
    const gone = new Set([...next.sold, ...next.held]);
    if (selectedNow.current.some((n) => gone.has(n))) {
      setSelected((current) => current.filter((n) => !gone.has(n)));
      setNotice(
        "Có ghế bạn đang chọn vừa được người khác giữ, nên đã được bỏ khỏi danh sách.",
      );
    }
  }, [showId, activeKey, activeZoneId, from, to]);

  // live map: ask again every 2 seconds, except while the tab is hidden
  useEffect(() => {
    viewKey.current = activeKey;
    const tick = () => {
      if (!document.hidden) void refresh();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, activeKey]);

  const adopt = useCallback((next: OrderView | null) => {
    setOrder(next);
    setSecondsLeft(next?.secondsLeft ?? 0);
  }, []);

  // coming back to the page picks up a hold that is still running, and opens its seats
  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/orders?showId=${encodeURIComponent(showId)}`,
        { cache: "no-store" },
      ).catch(() => null);
      if (!res?.ok) return;
      const { order: current } = await res.json();
      adopt(current);
      if (current) {
        const { zoneId: heldZone, seat } = current.seats[0];
        const section = venue.sections.find(
          (s) => s.zoneId === heldZone && s.first <= seat && seat <= s.last,
        );
        setZoneId(heldZone);
        if (section) {
          setActiveKey(section.key);
        }
      }
    })();
  }, [showId, adopt, venue]);

  // the countdown runs from the server's remaining seconds, so a wrong device clock doesn't matter
  const holdId = order?.id;
  useEffect(() => {
    if (!holdId) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [holdId]);

  useEffect(() => {
    if (!holdId || secondsLeft > 0) return;
    void (async () => {
      adopt(null);
      setNotice(
        "Đã hết 5 phút giữ ghế nên ghế được nhả. Bạn có thể chọn lại nếu ghế còn trống.",
      );
      await refresh();
    })();
  }, [holdId, secondsLeft, adopt, refresh]);

  function openSection(section: Section) {
    setNotice("");
    setStatus(null);
    setActiveKey(section.key);
    if (section.zoneId !== zoneId) {
      setZoneId(section.zoneId);
      setSelected([]);
    }
  }

  /** the + on a ticket card narrows the map to that tier's sections; one section opens straight away */
  function chooseTier(id: string) {
    setNotice("");
    setStatus(null);
    setActiveKey(null);
    if (id !== zoneId) setSelected([]);
    setZoneId(id);
    const sections = venue.sections.filter((s) => s.zoneId === id);
    if (sections.length === 1) openSection(sections[0]);
    // on phones the list sits below the map
    window.scrollTo({ top: 0 });
  }

  function backToOverview() {
    setActiveKey(null);
    setStatus(null);
    if (selected.length === 0) setZoneId(null);
  }

  /** a tier with one section has no list of sections to go back to */
  const tierHasOneSection =
    !!active &&
    venue.sections.filter((s) => s.zoneId === active.zoneId).length === 1;

  function leaveSection() {
    if (tierHasOneSection) {
      backToOverview();
    } else {
      setActiveKey(null);
      setStatus(null);
    }
  }

  function toggle(seat: number) {
    setNotice("");
    window.clearTimeout(limitTimer.current);
    setOverLimit(false);
    if (selected.includes(seat)) {
      setSelected(selected.filter((n) => n !== seat));
    } else if (selected.length >= MAX_SEATS_PER_ORDER) {
      setOverLimit(true);
      limitTimer.current = window.setTimeout(() => setOverLimit(false), 4000);
    } else {
      setSelected([...selected, seat].sort((a, b) => a - b));
    }
  }

  async function hold() {
    if (!zone) return;
    setBusy(true);
    setNotice("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showId, zoneId: zone.id, seats: selected }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) {
      adopt(data);
      setSelected([]);
    } else {
      setNotice(data?.error ?? "Không giữ được ghế, vui lòng thử lại.");
      if (Array.isArray(data?.taken)) {
        setSelected((current) =>
          current.filter((n) => !data.taken.includes(n)),
        );
      }
    }
    await refresh();
  }

  async function pay() {
    if (!order) return;
    setBusy(true);
    setNotice("");
    const res = await fetch(`/api/orders/${order.id}/pay`, {
      method: "POST",
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok) {
      adopt(null);
      setPaid(data);
    } else {
      setNotice(data?.error ?? "Không thanh toán được, vui lòng thử lại.");
      if (res?.status === 410) adopt(null);
    }
    await refresh();
  }

  async function cancel() {
    if (!order) return;
    setBusy(true);
    await fetch(`/api/orders/${order.id}`, { method: "DELETE" }).catch(
      () => null,
    );
    setBusy(false);
    adopt(null);
    setNotice("Đã huỷ giữ ghế.");
    await refresh();
  }

  // the seats stay memoised across renders, so they reach the latest toggle through a ref
  const toggleNow = useRef(toggle);
  useEffect(() => {
    toggleNow.current = toggle;
  });

  const seatStates = useMemo(
    () => ({
      sold: new Set(status?.sold),
      held: new Set(status?.held),
      mine: new Set(status?.mine),
      picked: new Set(selected),
    }),
    [status, selected],
  );

  const canHold = !!status;
  const hasOrder = !!order;
  const drawSeats = useMemo(
    () =>
      active ? (
        <SeatLayer
          layout={seatsOf(active)}
          states={seatStates}
          ready={canHold}
          locked={hasOrder}
          onToggle={(seat) => toggleNow.current(seat)}
        />
      ) : undefined,
    [active, seatStates, canHold, hasOrder],
  );

  return (
    <main className="buy-page">
      <div className="buy-head">
        <header className="buy-top">
          <Link href="/" className="buy-brand">
            <BrandMark size={26} />
            venu
          </Link>
        </header>

        <section className="buy-event">
          <div className="buy-thumb" style={artStyle(imageUrl)} />
          <div className="buy-event-copy">
            <div className="buy-event-name">
              <h1>{eventName}</h1>
              <Link
                href={`/events/${eventId}?dem=${night.id}`}
                className="buy-info"
              >
                Thông tin sự kiện
              </Link>
            </div>
            <div>{night.when}</div>
            <div>{venueName}</div>
          </div>
          {order && (
            <span className="buy-timer" role="timer">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path
                  d="M12 7v5l3 2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {clock(secondsLeft)}
            </span>
          )}
        </section>
      </div>

      <div className="buy-body">
        <div className="buy-stage">
          {zone || !seatMapUrl ? (
            <VenueMap
              venue={venue}
              tierId={zone?.id ?? null}
              isFull={(s) => sectionFull(s, takenByRow)}
              onPick={openSection}
              focus={active}
              seats={drawSeats}
            >
              {active ? (
                <>
                  <div className="venue-caption">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={leaveSection}
                    >
                      {tierHasOneSection
                        ? "← Toàn bộ sơ đồ"
                        : `← Các khu ${active.zoneName}`}
                    </button>
                    <span>
                      <b>{active.zoneName}</b>
                      {active.title !== active.zoneName && ` · ${active.title}`}
                    </span>
                  </div>
                  {overLimit && (
                    <p className="venue-warning" role="alert">
                      Mỗi lần chỉ được chọn tối đa {MAX_SEATS_PER_ORDER} vé. Bỏ
                      bớt một ghế để chọn ghế khác.
                    </p>
                  )}
                  <ul className="seat-legend venue-legend">
                    <li>
                      <i className="seat-dot free" /> Trống
                    </li>
                    <li>
                      <i className="seat-dot sold" /> Đã bán
                    </li>
                    <li>
                      <i className="seat-dot held" /> Đang giữ
                    </li>
                    <li>
                      <i className="seat-dot picked" /> Bạn chọn
                    </li>
                  </ul>
                </>
              ) : zone ? (
                <div className="venue-caption">
                  <span>
                    <b>{zone.name}</b>: chọn một khu để xem ghế
                  </span>
                  {seatMapUrl && (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={backToOverview}
                    >
                      Xem sơ đồ gốc
                    </button>
                  )}
                </div>
              ) : (
                <div className="venue-caption">Chọn một khu để xem ghế</div>
              )}
            </VenueMap>
          ) : (
            <div className="buy-photo">
              <ZoomableImage
                src={seatMapUrl}
                alt={`Sơ đồ khu vực của ${eventName}`}
              />
              <p className="buy-hint">
                Chọn hạng vé để xem các khu và chọn ghế.
              </p>
            </div>
          )}
        </div>

        <aside className="buy-side" aria-live="polite">
          {paid ? (
            <div className="buy-panel">
              <h2>Đặt vé thành công</h2>
              <p className="seat-panel-sub">
                Mã đơn: <code>{paid.id}</code>
              </p>
              <SeatLines order={paid} venue={venue} />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPaid(null);
                  setNotice("");
                }}
              >
                Mua thêm vé
              </button>
            </div>
          ) : order ? (
            <div className="buy-panel">
              <h2>Đang giữ ghế cho bạn</h2>
              <p className="seat-panel-sub">
                Hoàn tất trong {clock(secondsLeft)}, nếu không ghế sẽ tự động
                được nhả.
              </p>
              <SeatLines order={order} venue={venue} />
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={pay}
              >
                {busy ? "Đang xử lý…" : "Thanh toán thử"}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={cancel}
              >
                Huỷ giữ ghế
              </button>
              <p className="seat-panel-note">
                Chưa kết nối cổng thanh toán: bước này chỉ mô phỏng, không trừ
                tiền thật.
              </p>
            </div>
          ) : (
            <>
              {nights.length > 1 && (
                <nav className="buy-nights" aria-label="Chọn đêm diễn">
                  {nights.map((n) => (
                    <Link
                      key={n.id}
                      href={`/events/${eventId}/seats?dem=${n.id}`}
                      className={`chip ${n.id === night.id ? "active" : ""}`}
                      aria-current={n.id === night.id ? "true" : undefined}
                    >
                      {n.name}
                    </Link>
                  ))}
                </nav>
              )}

              <ul className="ticket-cards">
                {zones.map((z) => {
                  const remaining = left[z.id];
                  const soldOut = remaining === 0;
                  return (
                    <li
                      key={z.id}
                      className={`ticket-card ${z.id === zone?.id ? "active" : ""}`}
                      style={{ borderLeftColor: z.color ?? "#8fa3e8" }}
                    >
                      <div className="ticket-card-copy">
                        <b>{z.name}</b>
                        <span className="ticket-card-price">
                          {money.format(z.price)} ₫
                        </span>
                        <span className="ticket-card-left">
                          {remaining === undefined
                            ? "\u00a0"
                            : soldOut
                              ? "Hết vé"
                              : `Còn ${money.format(remaining)} vé`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="ticket-add"
                        disabled={soldOut}
                        aria-label={`Chọn ghế ${z.name}`}
                        onClick={() => chooseTier(z.id)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          aria-hidden="true"
                        >
                          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {zone && selected.length > 0 && (
                <div className="buy-basket">
                  <p className="seat-panel-sub">{zone.name}</p>
                  <ul className="seat-lines">
                    {selected.map((n) => (
                      <li key={n}>
                        <button
                          type="button"
                          className="seat-line-go"
                          title="Xem ghế này trên sơ đồ"
                          onClick={() => {
                            const section = venue.sections.find(
                              (x) =>
                                x.zoneId === zone.id &&
                                x.first <= n &&
                                n <= x.last,
                            );
                            if (!section) return;
                            setStatus(null);
                            setActiveKey(section.key);
                          }}
                        >
                          {seatName(venue, zone.id, n)}
                        </button>
                        <span className="num">
                          {money.format(zone.price)} ₫
                        </span>
                        <button
                          type="button"
                          className="seat-line-x"
                          aria-label={`Bỏ ghế ${seatName(venue, zone.id, n)}`}
                          onClick={() => toggle(n)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="seat-total">
                    <span>Tổng ({selected.length} vé)</span>
                    <b className="num">
                      {money.format(selected.length * zone.price)} ₫
                    </b>
                  </p>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={hold}
                  >
                    {busy ? "Đang giữ ghế…" : "Giữ ghế trong 5 phút"}
                  </button>
                </div>
              )}
            </>
          )}
          {notice && (
            <p className="seat-notice" role="status">
              {notice}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

function SeatLines({ order, venue }: { order: OrderView; venue: Venue }) {
  return (
    <>
      <ul className="seat-lines">
        {order.seats.map((s) => (
          <li key={`${s.zoneId}:${s.seat}`}>
            <span>
              <b>{seatName(venue, s.zoneId, s.seat)}</b>
            </span>
            <span className="num">{money.format(s.price)} ₫</span>
          </li>
        ))}
      </ul>
      <p className="seat-total">
        <span>Tổng</span>
        <b className="num">{money.format(order.total)} ₫</b>
      </p>
    </>
  );
}
