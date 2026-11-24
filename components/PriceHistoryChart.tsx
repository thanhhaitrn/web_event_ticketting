/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 1 — GIÁ MINH BẠCH (giao diện khán giả, S2-15)
 *
 * Giá hiện hành so với giá gốc của đợt (+/−%), biến động 24 giờ, biểu đồ bậc thang
 * lịch sử giá kèm đường giá gốc, khoảng thấp nhất – cao nhất và số ghế còn.
 * Dữ liệu lấy từ GET /api/pricing/public?showId=... (một phần tử của `zones`).
 * SVG thuần, không cần thư viện biểu đồ.
 */
import type { PublicPriceView } from "@/lib/pricing-copilot/transparency";

const vnd = (n: number) => n.toLocaleString("vi-VN") + " đ";
const signedVnd = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toLocaleString("vi-VN") + " đ";
const signedPct = (r: number) =>
  (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%";
const shortTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

// với người mua, giá tăng là bất lợi (đỏ), giá giảm là có lợi (xanh)
const COLOR = { up: "#b42318", stable: "#475467", down: "#067647" } as const;
const ICON = { up: "▲", stable: "■", down: "▼" } as const;
const direction = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "stable");

export function PriceHistoryChart({ view, zoneName }: { view: PublicPriceView; zoneName: string }) {
  const W = 320;
  const Hh = 110;
  const padX = 6;
  const padY = 10;
  const pts = view.history.map((p) => ({ t: new Date(p.at).getTime(), v: p.price }));
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[pts.length - 1]?.t ?? 1;
  // giá gốc luôn nằm trong khung để đường so sánh luôn hiện
  const vMin = Math.min(view.basePrice, ...pts.map((p) => p.v));
  const vMax = Math.max(view.basePrice, ...pts.map((p) => p.v));
  const x = (t: number) => padX + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * padX);
  const y = (v: number) => (vMax === vMin ? Hh / 2 : padY + (1 - (v - vMin) / (vMax - vMin)) * (Hh - 2 * padY));

  // Đường bậc thang: ngang tới thời điểm đổi, rồi dọc tới giá mới.
  let d = "";
  pts.forEach((p, i) => {
    if (i === 0) d += `M${x(p.t)},${y(p.v)}`;
    else d += ` H${x(p.t)} V${y(p.v)}`;
  });

  const vsBase = direction(view.currentPrice - view.basePrice);
  const changes = Math.max(0, view.history.length - 2);

  return (
    <section aria-label={`Giá vé ${zoneName}`} style={{ border: "1px solid #e4e7ec", borderRadius: 12, padding: 14, background: "#fff" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong>{zoneName}</strong>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{vnd(view.currentPrice)}</span>
      </header>

      {view.dynamic && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "6px 0", fontSize: 13 }}>
          <span style={{ color: "#475467" }}>
            Giá gốc {vsBase === "stable" ? vnd(view.basePrice) : <s>{vnd(view.basePrice)}</s>}
          </span>
          <span style={{ color: COLOR[vsBase], fontWeight: 600 }}>
            {vsBase === "stable" ? "Đúng bằng giá gốc" : `${ICON[vsBase]} ${signedPct(view.changeFromBase)} so với giá gốc`}
          </span>
        </div>
      )}

      {view.dynamic && (
        <p style={{ margin: "4px 0", fontSize: 13, color: COLOR[view.trend] }}>
          {ICON[view.trend]} {view.trendLabel}
          {view.change24h !== 0 && <> ({signedVnd(view.change24h)})</>} · <em>{view.notice}</em>
        </p>
      )}

      {view.dynamic && pts.length > 1 && (
        <figure style={{ margin: "8px 0 0" }}>
          <svg width="100%" viewBox={`0 0 ${W} ${Hh}`} role="img"
            aria-label={`Biểu đồ giá theo thời gian, từ ${vnd(view.lowest)} đến ${vnd(view.highest)}, giá gốc ${vnd(view.basePrice)}`}>
            <line x1={padX} x2={W - padX} y1={y(view.basePrice)} y2={y(view.basePrice)}
              stroke="#98a2b3" strokeWidth={1} strokeDasharray="4 4" />
            <path d={d} fill="none" stroke="#344054" strokeWidth={2} />
            <circle cx={x(t1)} cy={y(view.currentPrice)} r={3.5} fill={COLOR[vsBase]} />
          </svg>
          <figcaption style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#667085", marginTop: 2 }}>
            <span>{shortTime(view.history[0].at)}</span>
            <span>- - - giá gốc · {changes} lần đổi giá</span>
            <span>Bây giờ</span>
          </figcaption>
          {view.lowest !== view.highest && (
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#475467" }}>
              Trong đợt này: thấp nhất {vnd(view.lowest)} · cao nhất {vnd(view.highest)}
            </p>
          )}
        </figure>
      )}

      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475467" }}>Còn {view.seatsLeft.toLocaleString("vi-VN")} chỗ</p>
    </section>
  );
}
