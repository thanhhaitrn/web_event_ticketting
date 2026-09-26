"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GenreOption } from "@/lib/genres";
import DateTimeRangeField from "@/components/DateTimeRangeField";
import FilterMenu from "@/components/FilterMenu";
import ImageField from "@/components/ImageField";
import ConfirmModal from "@/components/ConfirmModal";
import { STATIC_DEMO } from "@/lib/demo";

type ZonePrice = {
  id: string;
  zoneId: string;
  phaseId: string;
  floorPrice: number;
  basePrice: number;
  ceilingPrice: number;
};

type ZoneQuota = { showId: string; capacity: number };

type Zone = {
  id: string;
  name: string;
  prices: ZonePrice[];
  quotas: ZoneQuota[];
};

type Show = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type Phase = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
};

type EventInfo = {
  id: string;
  name: string;
  artist: string | null;
  imageUrl: string | null;
  genreSlugs: string[];
  location: string;
  provinceCode: number | null;
  startTime: string;
  endTime: string;
  saleStart: string;
  saleEnd: string;
};

export type ProvinceOption = { code: number; name: string };

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmt = new Intl.NumberFormat("vi-VN");
// "24/10": Intl's vi-VN day+month output uses a dash
const dayFmt = {
  format(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  },
};

// tickets this zone sells on one night; no quota row means none
function quotaFor(zone: Zone, showId: string) {
  return zone.quotas.find((q) => q.showId === showId)?.capacity ?? 0;
}
function totalTickets(zone: Zone, shows: Show[]) {
  return shows.reduce((sum, s) => sum + quotaFor(zone, s.id), 0);
}
function without<T>(record: Record<string, T>, key: string) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}
function sortShows(shows: Show[]) {
  return [...shows].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
function fv(n: number | null | undefined) {
  return n === null || n === undefined ? "" : fmt.format(n);
}
function pv(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  return digits === "" ? null : parseInt(digits, 10);
}

type Tab = "event" | "shows" | "zones" | "pricing";

type Draft = {
  floor: number | null;
  base: number | null;
  ceiling: number | null;
};

function validity(d: Draft): "empty" | "bad" | "ok" {
  if (d.floor === null || d.base === null || d.ceiling === null) return "empty";
  if (
    d.floor < 0 ||
    d.floor > d.ceiling ||
    d.base < d.floor ||
    d.base > d.ceiling
  )
    return "bad";
  return "ok";
}

export default function EventWorkspace({
  event: initialEvent,
  zones: initialZones = [],
  phases: initialPhases = [],
  shows: initialShows = [],
  provinces,
  genres,
}: {
  event: EventInfo | null;
  zones?: Zone[];
  phases?: Phase[];
  shows?: Show[];
  provinces: ProvinceOption[];
  genres: GenreOption[];
}) {
  const [tab, setTab] = useState<Tab>("event");
  const [event, setEvent] = useState<EventInfo | null>(initialEvent);
  const [zones, setZones] = useState(initialZones);
  const [phases, setPhases] = useState(initialPhases);
  const [shows, setShowsState] = useState(sortShows(initialShows));
  const [activePhase, setActivePhase] = useState(initialPhases[0]?.id ?? "");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const router = useRouter();
  const locked = event === null;

  async function deleteEvent() {
    if (!event) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/events/${event.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!res || !res.ok) {
      setDeleting(false);
      setDeleteError("Không xoá được sự kiện, thử lại.");
      return;
    }
    router.push("/organizer/events");
    router.refresh();
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  // the server moves the event's dates to span its nights, so mirror that here
  function setShows(next: Show[]) {
    const sorted = sortShows(next);
    setShowsState(sorted);
    if (event && sorted.length > 0) {
      setEvent({
        ...event,
        startTime: sorted[0].startTime,
        endTime: sorted.reduce(
          (end, s) => (s.endTime > end ? s.endTime : end),
          sorted[0].endTime,
        ),
      });
    }
  }

  function goTab(next: Tab) {
    if (locked && next !== "event") {
      showToast("Hãy tạo và lưu thông tin sự kiện trước.");
      return;
    }
    setTab(next);
  }

  return (
    <main className="page narrow">
      <Link href="/organizer/events" className="back-link">
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
            d="M15 5l-7 7 7 7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Quay lại danh sách sự kiện
      </Link>
      {STATIC_DEMO && <DemoNote />}
      <div className="page-head">
        <div>
          <h1>{event ? event.name : "Sự kiện mới"}</h1>
          <div className="sub">
            {event
              ? [
                  event.location,
                  provinces.find((p) => p.code === event.provinceCode)?.name,
                ]
                  .filter(Boolean)
                  .join(", ")
              : "Điền thông tin cơ bản để bắt đầu"}
          </div>
        </div>
        {event && (
          <button
            type="button"
            className="btn danger"
            disabled={STATIC_DEMO}
            onClick={() => {
              setDeleteError("");
              setConfirmDelete(true);
            }}
          >
            Xoá sự kiện
          </button>
        )}
      </div>

      {event && confirmDelete && (
        <ConfirmModal
          title="Xoá sự kiện này?"
          confirmLabel="Xoá sự kiện"
          busy={deleting}
          error={deleteError}
          onConfirm={deleteEvent}
          onClose={() => setConfirmDelete(false)}
        >
          <p>
            <strong>{event.name}</strong> cùng toàn bộ khu vực ghế, đợt mở bán
            và giá vé sẽ bị xoá vĩnh viễn. Không thể hoàn tác.
          </p>
        </ConfirmModal>
      )}

      <div className="tabs">
        <button
          className={`tab ${tab === "event" ? "active" : ""}`}
          onClick={() => goTab("event")}
        >
          Thông tin sự kiện
        </button>
        <button
          className={`tab ${tab === "shows" ? "active" : ""} ${locked ? "locked" : ""}`}
          onClick={() => goTab("shows")}
        >
          Đêm diễn
        </button>
        <button
          className={`tab ${tab === "zones" ? "active" : ""} ${locked ? "locked" : ""}`}
          onClick={() => goTab("zones")}
        >
          Khu vực ghế
        </button>
        <button
          className={`tab ${tab === "pricing" ? "active" : ""} ${locked ? "locked" : ""}`}
          onClick={() => goTab("pricing")}
        >
          Giá vé
        </button>
      </div>

      {tab === "event" && (
        <fieldset className="demo-lock" disabled={STATIC_DEMO}>
          <EventTab
            event={event}
            setEvent={setEvent}
            showToast={showToast}
            provinces={provinces}
            genres={genres}
            shows={shows}
            openShows={() => goTab("shows")}
          />
        </fieldset>
      )}

      {tab === "shows" && event && (
        <fieldset className="demo-lock" disabled={STATIC_DEMO}>
          <ShowsTab
            eventId={event.id}
            shows={shows}
            setShows={setShows}
            showToast={showToast}
          />
        </fieldset>
      )}

      {tab === "zones" && event && (
        <fieldset className="demo-lock" disabled={STATIC_DEMO}>
          <ZonesTab
            eventId={event.id}
            zones={zones}
            setZones={setZones}
            shows={shows}
            showToast={showToast}
          />
        </fieldset>
      )}

      {tab === "pricing" && event && (
        <PricingTab
          eventId={event.id}
          zones={zones}
          setZones={setZones}
          shows={shows}
          phases={phases}
          setPhases={setPhases}
          activePhase={activePhase}
          setActivePhase={setActivePhase}
          showToast={showToast}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </main>
  );
}

/* ---------------- Tab 1: Event info ---------------- */

function EventTab({
  event,
  setEvent,
  showToast,
  provinces,
  genres,
  shows,
  openShows,
}: {
  event: EventInfo | null;
  setEvent: (e: EventInfo) => void;
  showToast: (m: string) => void;
  provinces: ProvinceOption[];
  genres: GenreOption[];
  shows: Show[];
  openShows: () => void;
}) {
  const router = useRouter();
  const isNew = event === null;
  const [form, setForm] = useState({
    name: event?.name ?? "",
    artist: event?.artist ?? "",
    imageUrl: event?.imageUrl ?? "",
    genreSlugs: event?.genreSlugs ?? [],
    location: event?.location ?? "",
    provinceCode: event?.provinceCode ? String(event.provinceCode) : "",
    startTime: event ? toLocalInput(event.startTime) : "",
    endTime: event ? toLocalInput(event.endTime) : "",
    saleStart: event ? toLocalInput(event.saleStart) : "",
    saleEnd: event ? toLocalInput(event.saleEnd) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(
    key: Exclude<keyof typeof form, "genreSlugs">,
    value: string,
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleGenre(slug: string) {
    setForm((f) => ({
      ...f,
      genreSlugs: f.genreSlugs.includes(slug)
        ? f.genreSlugs.filter((s) => s !== slug)
        : [...f.genreSlugs, slug],
    }));
  }

  async function save() {
    setError("");
    if (!form.name.trim() || !form.location.trim()) {
      setError("Vui lòng nhập tên sự kiện và nơi tổ chức.");
      return;
    }
    if (!form.provinceCode) {
      setError("Vui lòng chọn tỉnh/thành.");
      return;
    }
    if (
      (isNew && (!form.startTime || !form.endTime)) ||
      !form.saleStart ||
      !form.saleEnd
    ) {
      setError("Vui lòng nhập đầy đủ thời gian tổ chức và thời gian mở bán.");
      return;
    }
    if (form.saleStart >= form.saleEnd) {
      setError("Thời gian mở bán vé phải kết thúc sau khi bắt đầu.");
      return;
    }
    // an existing event's dates come from its nights (kept in `event`), not this form
    const firstShow = isNew ? form.startTime : toLocalInput(event.startTime);
    if (form.saleStart > firstShow) {
      setError("Vé phải bắt đầu mở bán trước khi sự kiện diễn ra.");
      return;
    }
    setSaving(true);
    const res = await fetch(isNew ? "/api/events" : `/api/events/${event.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        provinceCode: Number(form.provinceCode),
        ...(isNew
          ? {
              startTime: new Date(form.startTime).toISOString(),
              endTime: new Date(form.endTime).toISOString(),
            }
          : { startTime: undefined, endTime: undefined }),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Không thể lưu.");
      return;
    }
    const saved = await res.json();
    if (isNew) {
      showToast("Đã tạo sự kiện. Tiếp tục thêm khu vực ghế và giá vé.");
      router.replace(`/organizer/events/${saved.id}`);
      return;
    }
    // the API response has no genre list, so keep the one just saved
    setEvent({
      ...saved,
      startTime: new Date(saved.startTime).toISOString(),
      endTime: new Date(saved.endTime).toISOString(),
      saleStart: new Date(saved.saleStart).toISOString(),
      saleEnd: new Date(saved.saleEnd).toISOString(),
      genreSlugs: form.genreSlugs,
    });
    showToast("Đã lưu thông tin sự kiện.");
  }

  return (
    <div
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div className="form-grid full">
        <div className="field">
          <label htmlFor="ev-name">Tên sự kiện</label>
          <input
            id="ev-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>
      </div>
      <ImageField
        value={form.imageUrl}
        onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
      />
      <div className="form-grid full">
        <div className="field">
          <label htmlFor="ev-artist">Nghệ sĩ / ban nhạc</label>
          <input
            id="ev-artist"
            value={form.artist}
            onChange={(e) => update("artist", e.target.value)}
            placeholder="VD: Mỹ Tâm"
          />
        </div>
      </div>
      <fieldset className="field genre-field">
        <legend>
          Thể loại{" "}
          <span className="field-hint">
            {form.genreSlugs.length
              ? `đã chọn ${form.genreSlugs.length}`
              : "chọn một hoặc nhiều"}
          </span>
        </legend>
        <div className="genre-picks">
          {genres.map((g) => {
            const on = form.genreSlugs.includes(g.slug);
            return (
              <button
                key={g.slug}
                type="button"
                className={`genre-pick ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleGenre(g.slug)}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ev-location">Nơi tổ chức</label>
          <input
            id="ev-location"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="VD: SVĐ Mỹ Đình"
          />
        </div>
        <div className="field">
          <label htmlFor="ev-province">Tỉnh / thành</label>
          <select
            id="ev-province"
            value={form.provinceCode}
            onChange={(e) => update("provinceCode", e.target.value)}
            className="field-select"
          >
            <option value="" disabled>
              Chọn tỉnh/thành
            </option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-grid">
        {isNew ? (
          <DateTimeRangeField
            id="ev-when"
            label="Đêm diễn đầu tiên"
            modalTitle="Đêm diễn đầu tiên"
            from={form.startTime}
            to={form.endTime}
            defaultFromTime="19:00"
            defaultToTime="22:00"
            onChange={(f, t) =>
              setForm((prev) => ({ ...prev, startTime: f, endTime: t }))
            }
          />
        ) : (
          <div className="field">
            <span className="field-label">Thời gian tổ chức</span>
            <button
              type="button"
              className="field-trigger filled"
              onClick={openShows}
            >
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
              <span>
                {shows.length} đêm ·{" "}
                {shows
                  .map((s) => dayFmt.format(new Date(s.startTime)))
                  .join(", ")}
              </span>
              <span className="field-trigger-action">Chỉnh đêm diễn</span>
            </button>
          </div>
        )}
        <DateTimeRangeField
          id="ev-sale"
          label="Thời gian mở bán vé"
          modalTitle="Thời gian mở bán vé"
          from={form.saleStart}
          to={form.saleEnd}
          defaultFromTime="09:00"
          defaultToTime="23:59"
          onChange={(f, t) =>
            setForm((prev) => ({ ...prev, saleStart: f, saleEnd: t }))
          }
        />
      </div>
      {error && <div className="error-note">{error}</div>}
      <div className="actions">
        <button className="btn" onClick={save} disabled={saving}>
          {saving
            ? "Đang lưu..."
            : isNew
              ? "Tạo sự kiện"
              : "Lưu thông tin sự kiện"}
        </button>
        {isNew && (
          <span className="saved-note">
            Sau khi tạo, bạn sẽ thêm được các đêm diễn khác, khu vực ghế và giá
            vé.
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- Tab 2: Shows (nights) ---------------- */

// the next night defaults to the same hours one day after the last one
function nextNight(last: Show | undefined) {
  if (!last) return null;
  const day = 24 * 60 * 60 * 1000;
  return {
    startTime: new Date(new Date(last.startTime).getTime() + day).toISOString(),
    endTime: new Date(new Date(last.endTime).getTime() + day).toISOString(),
  };
}

function ShowsTab({
  eventId,
  shows,
  setShows,
  showToast,
}: {
  eventId: string;
  shows: Show[];
  setShows: (s: Show[]) => void;
  showToast: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Show | null>(null);

  async function patchShow(show: Show, body: Partial<Show>) {
    const res = await fetch(`/api/shows/${show.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "Không lưu được đêm diễn.");
      return;
    }
    const saved: Show = await res.json();
    setShows(shows.map((s) => (s.id === saved.id ? saved : s)));
    showToast(`Đã lưu "${saved.name}".`);
  }

  async function addShow() {
    const times = nextNight(shows[shows.length - 1]);
    if (!times) return;
    setAdding(true);
    const res = await fetch(`/api/events/${eventId}/shows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Đêm ${shows.length + 1}`, ...times }),
    }).catch(() => null);
    setAdding(false);
    if (!res || !res.ok) {
      showToast("Không thêm được đêm diễn.");
      return;
    }
    const show: Show = await res.json();
    setShows([...shows, show]);
    showToast(`Đã thêm "${show.name}". Nhớ đặt số vé ở tab Khu vực ghế.`);
  }

  async function removeShow(show: Show) {
    const res = await fetch(`/api/shows/${show.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setRemoving(null);
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "Không xoá được đêm diễn.");
      return;
    }
    setShows(shows.filter((s) => s.id !== show.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="show-list">
        {shows.map((show) => (
          <div className="show-row card" key={show.id}>
            <div className="field">
              <label htmlFor={`show-name-${show.id}`}>Tên đêm diễn</label>
              <input
                id={`show-name-${show.id}`}
                value={names[show.id] ?? show.name}
                onChange={(e) =>
                  setNames({ ...names, [show.id]: e.target.value })
                }
                onBlur={() => {
                  const name = names[show.id];
                  if (name === undefined || name === show.name) return;
                  if (!name.trim()) {
                    setNames({ ...names, [show.id]: show.name });
                    return;
                  }
                  patchShow(show, { name });
                }}
              />
            </div>
            <DateTimeRangeField
              id={`show-when-${show.id}`}
              label="Thời gian"
              modalTitle={show.name}
              from={toLocalInput(show.startTime)}
              to={toLocalInput(show.endTime)}
              defaultFromTime="19:00"
              defaultToTime="22:00"
              onChange={(f, t) =>
                patchShow(show, {
                  startTime: new Date(f).toISOString(),
                  endTime: new Date(t).toISOString(),
                })
              }
            />
            <button
              className="icon-btn show-remove"
              onClick={() => setRemoving(show)}
              disabled={shows.length <= 1}
              title={
                shows.length <= 1
                  ? "Sự kiện cần ít nhất một đêm diễn"
                  : "Xoá đêm diễn"
              }
              aria-label={`Xoá ${show.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={addShow} disabled={adding}>
          {adding ? "Đang thêm..." : "+ Thêm đêm diễn"}
        </button>
        <span className="saved-note">
          Đêm mới có cùng giờ, vào ngày sau đêm cuối. Thời gian tổ chức của sự
          kiện tự cập nhật theo các đêm.
        </span>
      </div>

      {removing && (
        <ConfirmModal
          title="Xoá đêm diễn này?"
          confirmLabel="Xoá đêm diễn"
          onConfirm={() => removeShow(removing)}
          onClose={() => setRemoving(null)}
        >
          <p>
            <strong>{removing.name}</strong> và số vé của mọi khu vực trong đêm
            này sẽ bị xoá.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

/* ---------------- Tab 3: Zones ---------------- */

function ZonesTab({
  eventId,
  zones,
  setZones,
  shows,
  showToast,
}: {
  eventId: string;
  zones: Zone[];
  setZones: (z: Zone[]) => void;
  shows: Show[];
  showToast: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  // unsaved edits, keyed by zone id; saved when the input loses focus
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [countDrafts, setCountDrafts] = useState<
    Record<string, Record<string, number>>
  >({});

  async function addZone() {
    setAdding(true);
    const res = await fetch(`/api/events/${eventId}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Khu vực mới" }),
    });
    setAdding(false);
    if (!res.ok) {
      showToast("Không thể thêm khu vực.");
      return;
    }
    const zone = await res.json();
    setZones([...zones, zone]);
  }

  async function saveZone(zone: Zone, body: object) {
    const res = await fetch(`/api/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({}));
      showToast(data?.error || "Không lưu được khu vực.");
      return;
    }
    const saved: Zone = await res.json();
    setZones(zones.map((z) => (z.id === saved.id ? saved : z)));
    showToast(`Đã lưu "${saved.name}".`);
  }

  function saveName(zone: Zone) {
    const name = nameDrafts[zone.id];
    if (name === undefined || name === zone.name) return;
    setNameDrafts(without(nameDrafts, zone.id));
    if (!name.trim()) return;
    saveZone(zone, { name });
  }

  function saveCount(zone: Zone, showId: string) {
    const count = countDrafts[zone.id]?.[showId];
    if (count === undefined) return;
    setCountDrafts({
      ...countDrafts,
      [zone.id]: without(countDrafts[zone.id], showId),
    });
    if (count === quotaFor(zone, showId)) return;
    saveZone(zone, { capacities: { [showId]: count } });
  }

  async function deleteZone(id: string) {
    await fetch(`/api/zones/${id}`, { method: "DELETE" });
    setZones(zones.filter((z) => z.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="table-wrap scroll-x">
        <table>
          <thead>
            <tr>
              <th>Khu vực / loại vé</th>
              {shows.map((show) => (
                <th key={show.id} className="num-col">
                  Số vé {show.name}
                  <span className="th-sub">
                    {dayFmt.format(new Date(show.startTime))}
                  </span>
                </th>
              ))}
              {shows.length > 1 && <th className="num-col">Tổng</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zones.length === 0 && (
              <tr>
                <td
                  colSpan={shows.length + 3}
                  style={{ color: "var(--muted)", fontSize: 12.5 }}
                >
                  Chưa có khu vực ghế nào.
                </td>
              </tr>
            )}
            {zones.map((z) => (
              <tr key={z.id}>
                <td>
                  <input
                    aria-label="Tên khu vực"
                    value={nameDrafts[z.id] ?? z.name}
                    onChange={(e) =>
                      setNameDrafts({ ...nameDrafts, [z.id]: e.target.value })
                    }
                    onBlur={() => saveName(z)}
                    placeholder="VD: VIP, Hạng 1..."
                  />
                </td>
                {shows.map((show) => (
                  <td key={show.id}>
                    <input
                      className="num"
                      inputMode="numeric"
                      aria-label={`Số vé ${z.name}, ${show.name}`}
                      value={fv(
                        countDrafts[z.id]?.[show.id] ?? quotaFor(z, show.id),
                      )}
                      onChange={(e) =>
                        setCountDrafts({
                          ...countDrafts,
                          [z.id]: {
                            ...countDrafts[z.id],
                            [show.id]: pv(e.target.value) ?? 0,
                          },
                        })
                      }
                      onBlur={() => saveCount(z, show.id)}
                      placeholder="0"
                    />
                  </td>
                ))}
                {shows.length > 1 && (
                  <td className="zone-total num">
                    {fmt.format(totalTickets(z, shows))}
                  </td>
                )}
                <td>
                  <button
                    className="icon-btn"
                    onClick={() => deleteZone(z.id)}
                    title="Xoá khu vực"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={addZone} disabled={adding}>
          {adding ? "Đang thêm..." : "+ Thêm khu vực"}
        </button>
        <span className="saved-note">
          Mỗi đêm có số vé riêng. Thay đổi được lưu ngay khi rời khỏi ô nhập.
        </span>
      </div>
    </div>
  );
}

/* ---------------- Tab 4: Pricing ---------------- */

function PricingTab({
  eventId,
  zones,
  setZones,
  shows,
  phases,
  setPhases,
  activePhase,
  setActivePhase,
  showToast,
}: {
  eventId: string;
  zones: Zone[];
  setZones: (z: Zone[]) => void;
  shows: Show[];
  phases: Phase[];
  setPhases: (p: Phase[]) => void;
  activePhase: string;
  setActivePhase: (id: string) => void;
  showToast: (m: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showNewPhase, setShowNewPhase] = useState(false);
  const [newPhase, setNewPhase] = useState({
    name: "",
    startTime: "",
    endTime: "",
  });
  const [savingAll, setSavingAll] = useState(false);
  const [removingPhase, setRemovingPhase] = useState<Phase | null>(null);
  const [deletingPhase, setDeletingPhase] = useState(false);
  const [phaseError, setPhaseError] = useState("");

  async function deletePhase(phase: Phase) {
    setDeletingPhase(true);
    setPhaseError("");
    const res = await fetch(`/api/phases/${phase.id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeletingPhase(false);
    if (!res || !res.ok) {
      setPhaseError("Không xoá được đợt mở bán, thử lại.");
      return;
    }
    const rest = phases.filter((p) => p.id !== phase.id);
    setPhases(rest);
    // the phase's prices went with it in the database
    setZones(
      zones.map((z) => ({
        ...z,
        prices: z.prices.filter((p) => p.phaseId !== phase.id),
      })),
    );
    if (activePhase === phase.id) {
      setActivePhase(rest[0]?.id ?? "");
      setDrafts({});
    }
    setRemovingPhase(null);
    showToast(`Đã xoá "${phase.name}".`);
  }

  function draftFor(zone: Zone): Draft {
    if (drafts[zone.id]) return drafts[zone.id];
    const existing = zone.prices.find((p) => p.phaseId === activePhase);
    return {
      floor: existing?.floorPrice ?? null,
      base: existing?.basePrice ?? null,
      ceiling: existing?.ceilingPrice ?? null,
    };
  }

  function updateDraft(zoneId: string, key: keyof Draft, value: string) {
    const zone = zones.find((z) => z.id === zoneId)!;
    const current = draftFor(zone);
    setDrafts({ ...drafts, [zoneId]: { ...current, [key]: pv(value) } });
  }

  async function addPhase() {
    if (!newPhase.name.trim() || !newPhase.startTime || !newPhase.endTime) {
      showToast("Vui lòng nhập đủ tên và thời gian đợt mở bán.");
      return;
    }
    const res = await fetch(`/api/events/${eventId}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newPhase),
    });
    if (!res.ok) {
      showToast("Không thể tạo đợt mở bán.");
      return;
    }
    const phase = await res.json();
    setPhases([...phases, phase]);
    setActivePhase(phase.id);
    setShowNewPhase(false);
    setNewPhase({ name: "", startTime: "", endTime: "" });
  }

  async function saveAll() {
    const bad = zones.some((z) => validity(draftFor(z)) === "bad");
    if (bad) {
      showToast("Còn khu vực vi phạm biên giá — kiểm tra lại trước khi lưu.");
      return;
    }
    setSavingAll(true);
    const updatedZones = [...zones];
    for (const zone of zones) {
      const d = draftFor(zone);
      if (validity(d) !== "ok") continue;
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId: zone.id,
          phaseId: activePhase,
          floorPrice: d.floor,
          basePrice: d.base,
          ceilingPrice: d.ceiling,
        }),
      });
      if (res.ok) {
        const price = await res.json();
        const idx = updatedZones.findIndex((z) => z.id === zone.id);
        const otherPrices = updatedZones[idx].prices.filter(
          (p) => p.phaseId !== activePhase,
        );
        updatedZones[idx] = {
          ...updatedZones[idx],
          prices: [...otherPrices, price],
        };
      }
    }
    setZones(updatedZones);
    setDrafts({});
    setSavingAll(false);
    showToast("Đã lưu giá vé cho đợt đã chọn.");
  }

  if (phases.length === 0 && !showNewPhase) {
    return (
      <div className="empty-state">
        Chưa có đợt mở bán nào.{" "}
        <button
          className="btn small"
          style={{ marginTop: 10 }}
          disabled={STATIC_DEMO}
          onClick={() => setShowNewPhase(true)}
        >
          + Tạo đợt mở bán
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="phase-row">
        <span className="phase-label">Đợt mở bán:</span>
        {phases.length > 0 && (
          <FilterMenu
            ariaLabel="Chọn đợt mở bán"
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
                  d="M4 8.5V6a2 2 0 012-2h12a2 2 0 012 2v2.5a2.5 2.5 0 000 5V16a2 2 0 01-2 2H6a2 2 0 01-2-2v-2.5a2.5 2.5 0 000-5z"
                  strokeLinejoin="round"
                />
                <path d="M14 4v14" strokeDasharray="2 2.5" />
              </svg>
            }
            label={phases.find((p) => p.id === activePhase)?.name ?? "Chọn đợt"}
            value={activePhase}
            options={phases.map((p) => ({ value: p.id, label: p.name }))}
            onPick={setActivePhase}
          />
        )}
        <fieldset className="phase-actions demo-lock" disabled={STATIC_DEMO}>
          {phases.length > 0 && activePhase && (
            <button
              className="btn danger small"
              onClick={() => {
                const phase = phases.find((p) => p.id === activePhase);
                if (!phase) return;
                setPhaseError("");
                setRemovingPhase(phase);
              }}
            >
              Xoá đợt
            </button>
          )}
          <button
            className="btn ghost small"
            onClick={() => setShowNewPhase((s) => !s)}
          >
            + Thêm đợt
          </button>
        </fieldset>
      </div>

      {removingPhase && (
        <ConfirmModal
          title="Xoá đợt mở bán này?"
          confirmLabel="Xoá đợt"
          busy={deletingPhase}
          error={phaseError}
          onConfirm={() => deletePhase(removingPhase)}
          onClose={() => setRemovingPhase(null)}
        >
          <p>
            <strong>{removingPhase.name}</strong> cùng giá vé của mọi khu vực
            trong đợt này sẽ bị xoá vĩnh viễn. Không thể hoàn tác.
          </p>
        </ConfirmModal>
      )}

      {/* the phase picker above stays usable, so every phase's prices can be viewed */}
      <fieldset className="demo-lock" disabled={STATIC_DEMO}>
        {showNewPhase && (
          <div className="card form-grid">
            <div className="field">
              <label htmlFor="ph-name">Tên đợt</label>
              <input
                id="ph-name"
                value={newPhase.name}
                onChange={(e) =>
                  setNewPhase({ ...newPhase, name: e.target.value })
                }
                placeholder="VD: Đợt 2 — Chính thức"
              />
            </div>
            <DateTimeRangeField
              id="ph-when"
              label="Thời gian đợt mở bán"
              modalTitle="Thời gian đợt mở bán"
              from={newPhase.startTime}
              to={newPhase.endTime}
              defaultFromTime="09:00"
              defaultToTime="23:59"
              onChange={(f, t) =>
                setNewPhase((prev) => ({ ...prev, startTime: f, endTime: t }))
              }
            />
            <div className="actions" style={{ gridColumn: "1 / -1" }}>
              <button className="btn small" onClick={addPhase}>
                Tạo đợt
              </button>
            </div>
          </div>
        )}

        {phases.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Khu vực ghế</th>
                    <th>Giá sàn</th>
                    <th>Giá cơ bản</th>
                    <th>Giá trần</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ color: "var(--muted)", fontSize: 12.5 }}
                      >
                        Chưa có khu vực ghế nào — hãy thêm ở tab &quot;Khu vực
                        ghế&quot;.
                      </td>
                    </tr>
                  )}
                  {zones.map((z) => {
                    const d = draftFor(z);
                    const v = validity(d);
                    return (
                      <tr key={z.id}>
                        <td>
                          <div className="zone-name">{z.name}</div>
                          <div className="zone-seats">
                            {fmt.format(totalTickets(z, shows))} vé
                            {shows.length > 1 && ` · ${shows.length} đêm`}
                          </div>
                        </td>
                        <td className="cell">
                          <input
                            className="num"
                            inputMode="numeric"
                            value={fv(d.floor)}
                            onChange={(e) =>
                              updateDraft(z.id, "floor", e.target.value)
                            }
                            placeholder="—"
                          />
                        </td>
                        <td className="cell base">
                          <input
                            className="num"
                            inputMode="numeric"
                            value={fv(d.base)}
                            onChange={(e) =>
                              updateDraft(z.id, "base", e.target.value)
                            }
                            placeholder="—"
                          />
                        </td>
                        <td className="cell">
                          <input
                            className="num"
                            inputMode="numeric"
                            value={fv(d.ceiling)}
                            onChange={(e) =>
                              updateDraft(z.id, "ceiling", e.target.value)
                            }
                            placeholder="—"
                          />
                        </td>
                        <td>
                          <span
                            className={`pill ${v === "ok" ? "ok" : v === "bad" ? "bad" : "empty"}`}
                          >
                            {v === "ok"
                              ? "Hợp lệ"
                              : v === "bad"
                                ? "Sai biên"
                                : "Chưa nhập"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="note">
              <b>Giá sàn</b> / <b>giá trần</b> là biên an toàn cho tính năng{" "}
              <b>định giá động</b> ở giai đoạn sau — giá vé sau này sẽ chỉ dao
              động trong khoảng này.
            </div>

            <div className="actions">
              <button
                className="btn"
                onClick={saveAll}
                disabled={savingAll || zones.length === 0}
              >
                {savingAll ? "Đang lưu..." : "Lưu thiết lập giá"}
              </button>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}

export function DemoNote() {
  return (
    <div className="demo-note" role="note">
      <b>Bản demo tĩnh</b> — chỉ để xem. Các thay đổi không được lưu.
    </div>
  );
}
