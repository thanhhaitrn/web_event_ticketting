"use client";

import { useState } from "react";

type ZonePrice = {
  id: string;
  zoneId: string;
  phaseId: string;
  floorPrice: number;
  basePrice: number;
  ceilingPrice: number;
};

type Zone = {
  id: string;
  name: string;
  capacity: number;
  prices: ZonePrice[];
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
  location: string;
  startTime: string;
  endTime: string;
  saleStart: string;
  saleEnd: string;
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmt = new Intl.NumberFormat("vi-VN");
function fv(n: number | null | undefined) {
  return n === null || n === undefined ? "" : fmt.format(n);
}
function pv(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  return digits === "" ? null : parseInt(digits, 10);
}

type Draft = { floor: number | null; base: number | null; ceiling: number | null };

function validity(d: Draft): "empty" | "bad" | "ok" {
  if (d.floor === null || d.base === null || d.ceiling === null) return "empty";
  if (d.floor < 0 || d.floor > d.ceiling || d.base < d.floor || d.base > d.ceiling) return "bad";
  return "ok";
}

export default function EventWorkspace({
  event: initialEvent,
  zones: initialZones,
  phases: initialPhases,
}: {
  event: EventInfo;
  zones: Zone[];
  phases: Phase[];
}) {
  const [tab, setTab] = useState<"event" | "zones" | "pricing">("event");
  const [event, setEvent] = useState(initialEvent);
  const [zones, setZones] = useState(initialZones);
  const [phases, setPhases] = useState(initialPhases);
  const [activePhase, setActivePhase] = useState(initialPhases[0]?.id ?? "");
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  return (
    <div className="page">
      <div>
        <h1>{event.name}</h1>
        <div className="sub">{event.location}</div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "event" ? "active" : ""}`} onClick={() => setTab("event")}>
          Thông tin sự kiện
        </button>
        <button className={`tab ${tab === "zones" ? "active" : ""}`} onClick={() => setTab("zones")}>
          Khu vực ghế
        </button>
        <button className={`tab ${tab === "pricing" ? "active" : ""}`} onClick={() => setTab("pricing")}>
          Giá vé
        </button>
      </div>

      {tab === "event" && (
        <EventTab event={event} setEvent={setEvent} showToast={showToast} />
      )}

      {tab === "zones" && (
        <ZonesTab eventId={event.id} zones={zones} setZones={setZones} showToast={showToast} />
      )}

      {tab === "pricing" && (
        <PricingTab
          eventId={event.id}
          zones={zones}
          setZones={setZones}
          phases={phases}
          setPhases={setPhases}
          activePhase={activePhase}
          setActivePhase={setActivePhase}
          showToast={showToast}
        />
      )}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

/* ---------------- Tab 1: Event info ---------------- */

function EventTab({
  event,
  setEvent,
  showToast,
}: {
  event: EventInfo;
  setEvent: (e: EventInfo) => void;
  showToast: (m: string) => void;
}) {
  const [form, setForm] = useState({
    name: event.name,
    location: event.location,
    startTime: toLocalInput(event.startTime),
    endTime: toLocalInput(event.endTime),
    saleStart: toLocalInput(event.saleStart),
    saleEnd: toLocalInput(event.saleEnd),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError("");
    if (!form.name.trim() || !form.location.trim()) {
      setError("Vui lòng nhập tên sự kiện và địa điểm.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Không thể lưu.");
      return;
    }
    const updated = await res.json();
    setEvent(updated);
    showToast("Đã lưu thông tin sự kiện.");
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="form-grid full">
        <div className="field">
          <label htmlFor="ev-name">Tên sự kiện</label>
          <input id="ev-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
        </div>
      </div>
      <div className="form-grid full">
        <div className="field">
          <label htmlFor="ev-location">Địa điểm</label>
          <input id="ev-location" value={form.location} onChange={(e) => update("location", e.target.value)} />
        </div>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="ev-start">Thời gian tổ chức — bắt đầu</label>
          <input id="ev-start" type="datetime-local" value={form.startTime} onChange={(e) => update("startTime", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-end">Thời gian tổ chức — kết thúc</label>
          <input id="ev-end" type="datetime-local" value={form.endTime} onChange={(e) => update("endTime", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-saleStart">Mở bán vé — từ</label>
          <input id="ev-saleStart" type="datetime-local" value={form.saleStart} onChange={(e) => update("saleStart", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-saleEnd">Mở bán vé — đến</label>
          <input id="ev-saleEnd" type="datetime-local" value={form.saleEnd} onChange={(e) => update("saleEnd", e.target.value)} />
        </div>
      </div>
      {error && <div className="error-note">{error}</div>}
      <div className="actions">
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? "Đang lưu..." : "Lưu thông tin sự kiện"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Tab 2: Zones ---------------- */

function ZonesTab({
  eventId,
  zones,
  setZones,
  showToast,
}: {
  eventId: string;
  zones: Zone[];
  setZones: (z: Zone[]) => void;
  showToast: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  function patchLocal(id: string, patch: Partial<Zone>) {
    setZones(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  async function addZone() {
    setAdding(true);
    const res = await fetch(`/api/events/${eventId}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Khu vực mới", capacity: 0 }),
    });
    setAdding(false);
    if (!res.ok) {
      showToast("Không thể thêm khu vực.");
      return;
    }
    const zone = await res.json();
    setZones([...zones, zone]);
  }

  async function saveZone(zone: Zone) {
    const res = await fetch(`/api/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: zone.name, capacity: zone.capacity }),
    });
    if (res.ok) showToast(`Đã lưu "${zone.name}".`);
  }

  async function deleteZone(id: string) {
    await fetch(`/api/zones/${id}`, { method: "DELETE" });
    setZones(zones.filter((z) => z.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <table>
        <thead>
          <tr>
            <th>Tên khu vực</th>
            <th>Sức chứa (ghế)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {zones.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: "var(--muted)", fontSize: 12.5 }}>
                Chưa có khu vực ghế nào.
              </td>
            </tr>
          )}
          {zones.map((z) => (
            <tr key={z.id}>
              <td>
                <input
                  value={z.name}
                  onChange={(e) => patchLocal(z.id, { name: e.target.value })}
                  onBlur={() => saveZone(z)}
                  placeholder="VD: VIP, Hạng 1..."
                />
              </td>
              <td>
                <input
                  className="num"
                  inputMode="numeric"
                  value={fv(z.capacity)}
                  onChange={(e) => patchLocal(z.id, { capacity: pv(e.target.value) ?? 0 })}
                  onBlur={() => saveZone(z)}
                  placeholder="0"
                />
              </td>
              <td>
                <button className="icon-btn" onClick={() => deleteZone(z.id)} title="Xoá khu vực">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions">
        <button className="btn ghost" onClick={addZone} disabled={adding}>
          {adding ? "Đang thêm..." : "+ Thêm khu vực"}
        </button>
        <span className="saved-note">Thay đổi được lưu ngay khi rời khỏi ô nhập.</span>
      </div>
    </div>
  );
}

/* ---------------- Tab 3: Pricing ---------------- */

function PricingTab({
  eventId,
  zones,
  setZones,
  phases,
  setPhases,
  activePhase,
  setActivePhase,
  showToast,
}: {
  eventId: string;
  zones: Zone[];
  setZones: (z: Zone[]) => void;
  phases: Phase[];
  setPhases: (p: Phase[]) => void;
  activePhase: string;
  setActivePhase: (id: string) => void;
  showToast: (m: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showNewPhase, setShowNewPhase] = useState(false);
  const [newPhase, setNewPhase] = useState({ name: "", startTime: "", endTime: "" });
  const [savingAll, setSavingAll] = useState(false);

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
        const otherPrices = updatedZones[idx].prices.filter((p) => p.phaseId !== activePhase);
        updatedZones[idx] = { ...updatedZones[idx], prices: [...otherPrices, price] };
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
        <button className="btn small" style={{ marginTop: 10 }} onClick={() => setShowNewPhase(true)}>
          + Tạo đợt mở bán
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="phase-row">
        <label htmlFor="phaseSelect">Đợt mở bán:</label>
        {phases.length > 0 && (
          <select id="phaseSelect" value={activePhase} onChange={(e) => setActivePhase(e.target.value)}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn ghost small" style={{ marginLeft: "auto" }} onClick={() => setShowNewPhase((s) => !s)}>
          + Thêm đợt
        </button>
      </div>

      {showNewPhase && (
        <div className="card form-grid">
          <div className="field">
            <label htmlFor="ph-name">Tên đợt</label>
            <input
              id="ph-name"
              value={newPhase.name}
              onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })}
              placeholder="VD: Đợt 2 — Chính thức"
            />
          </div>
          <div className="field">
            <label htmlFor="ph-start">Bắt đầu</label>
            <input
              id="ph-start"
              type="datetime-local"
              value={newPhase.startTime}
              onChange={(e) => setNewPhase({ ...newPhase, startTime: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ph-end">Kết thúc</label>
            <input
              id="ph-end"
              type="datetime-local"
              value={newPhase.endTime}
              onChange={(e) => setNewPhase({ ...newPhase, endTime: e.target.value })}
            />
          </div>
          <div className="actions" style={{ gridColumn: "1 / -1" }}>
            <button className="btn small" onClick={addPhase}>
              Tạo đợt
            </button>
          </div>
        </div>
      )}

      {phases.length > 0 && (
        <>
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
                  <td colSpan={5} style={{ color: "var(--muted)", fontSize: 12.5 }}>
                    Chưa có khu vực ghế nào — hãy thêm ở tab &quot;Khu vực ghế&quot;.
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
                      <div className="zone-seats">{fmt.format(z.capacity)} ghế</div>
                    </td>
                    <td className="cell">
                      <input
                        className="num"
                        inputMode="numeric"
                        value={fv(d.floor)}
                        onChange={(e) => updateDraft(z.id, "floor", e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td className="cell base">
                      <input
                        className="num"
                        inputMode="numeric"
                        value={fv(d.base)}
                        onChange={(e) => updateDraft(z.id, "base", e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td className="cell">
                      <input
                        className="num"
                        inputMode="numeric"
                        value={fv(d.ceiling)}
                        onChange={(e) => updateDraft(z.id, "ceiling", e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <span className={`pill ${v === "ok" ? "ok" : v === "bad" ? "bad" : "empty"}`}>
                        {v === "ok" ? "Hợp lệ" : v === "bad" ? "Sai biên" : "Chưa nhập"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="note">
            <b>Giá sàn</b> / <b>giá trần</b> là biên an toàn cho tính năng <b>định giá động</b> ở giai đoạn sau —
            giá vé sau này sẽ chỉ dao động trong khoảng này.
          </div>

          <div className="actions">
            <button className="btn" onClick={saveAll} disabled={savingAll || zones.length === 0}>
              {savingAll ? "Đang lưu..." : "Lưu thiết lập giá"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
