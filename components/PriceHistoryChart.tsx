/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 1 — GIÁ MINH BẠCH (giao diện khán giả, S2-15)
 *
 * Biểu đồ bậc thang lịch sử giá + nhãn xu hướng 24 giờ + số ghế còn.
 * Dữ liệu lấy từ GET /api/pricing/public?showId=... (một phần tử của `zones`).
 * SVG thuần, không cần thư viện biểu đồ.
 */
import type { PublicPriceView } from "@/lib/pricing-copilot/transparency";

const vnd = (n: number) => n.toLocaleString("vi-VN") + " đ";
const TREND_COLOR = { up: "#b42318", stable: "#475467", down: "#067647" } as const;
const TREND_ICON = { up: "▲", stable: "■", down: "▼" } as const;

export function PriceHistoryChart({ view, zoneName }: { view: PublicPriceView; zoneName: string }) {
  const W = 320;
  const Hh = 96;
  const pad = 6;
  const pts = view.history.map((p) => ({ t: new Date(p.at).getTime(), v: p.price }));
  const t0 = pts[0]?.t ?? 0;
  const t1 = pts[pts.length - 1]?.t ?? 1;
  const vMin = Math.min(...pts.map((p) => p.v));
  const vMax = Math.max(...pts.map((p) => p.v));
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const y = (v: number) => (vMax === vMin ? Hh / 2 : pad + (1 - (v - vMin) / (vMax - vMin)) * (Hh - 2 * pad));

  // Đường bậc thang: ngang tới thời điểm đổi, rồi dọc tới giá mới.
  let d = "";
  pts.forEach((p, i) => {
    if (i === 0) d += `M${x(p.t)},${y(p.v)}`;
    else d += ` H${x(p.t)} V${y(p.v)}`;
  });

  return (
    <section aria-label={`Lịch sử giá ${zoneName}`} style={{ border: "1px solid #e4e7ec", borderRadius: 8, padding: 12, maxWidth: W + 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong>{zoneName}</strong>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{vnd(view.currentPrice)}</span>
      </header>

      {view.dynamic && (
        <p style={{ margin: "4px 0", fontSize: 13, color: TREND_COLOR[view.trend] }}>
          {TREND_ICON[view.trend]} {view.trendLabel} · <em>{view.notice}</em>
        </p>
      )}

      {view.dynamic && pts.length > 1 && (
        <svg width="100%" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Biểu đồ giá theo thời gian">
          <path d={d} fill="none" stroke="#344054" strokeWidth={2} />
        </svg>
      )}

      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475467" }}>Còn {view.seatsLeft.toLocaleString("vi-VN")} chỗ</p>
    </section>
  );
}
