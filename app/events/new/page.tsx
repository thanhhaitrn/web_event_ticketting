"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    location: "",
    startTime: "",
    endTime: "",
    saleStart: "",
    saleEnd: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.location.trim()) {
      setError("Vui lòng nhập tên sự kiện và địa điểm.");
      return;
    }
    if (!form.startTime || !form.endTime || !form.saleStart || !form.saleEnd) {
      setError("Vui lòng nhập đầy đủ thời gian tổ chức và thời gian mở bán.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Không thể tạo sự kiện.");
      return;
    }
    const event = await res.json();
    router.push(`/events/${event.id}`);
  }

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <div>
        <h1>Tạo sự kiện</h1>
        <div className="sub">Nhập thông tin cơ bản của sự kiện</div>
      </div>

      <form className="card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="form-grid full">
          <div className="field">
            <label htmlFor="ev-name">Tên sự kiện</label>
            <input
              id="ev-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="VD: Concert Mùa Hè Rực Rỡ 2026"
            />
          </div>
        </div>
        <div className="form-grid full">
          <div className="field">
            <label htmlFor="ev-location">Địa điểm</label>
            <input
              id="ev-location"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="VD: SVĐ Mỹ Đình, Hà Nội"
            />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="ev-start">Thời gian tổ chức — bắt đầu</label>
            <input
              id="ev-start"
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => update("startTime", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-end">Thời gian tổ chức — kết thúc</label>
            <input
              id="ev-end"
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => update("endTime", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-saleStart">Mở bán vé — từ</label>
            <input
              id="ev-saleStart"
              type="datetime-local"
              value={form.saleStart}
              onChange={(e) => update("saleStart", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-saleEnd">Mở bán vé — đến</label>
            <input
              id="ev-saleEnd"
              type="datetime-local"
              value={form.saleEnd}
              onChange={(e) => update("saleEnd", e.target.value)}
            />
          </div>
        </div>

        {error && <div className="error-note">{error}</div>}

        <div className="actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Đang tạo..." : "Tạo sự kiện"}
          </button>
        </div>
      </form>
    </div>
  );
}
