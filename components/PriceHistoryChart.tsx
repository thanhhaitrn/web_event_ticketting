import { useId } from "react";
import type { PublicPriceView } from "@/lib/pricing-copilot/transparency";
import styles from "./PriceHistoryChart.module.css";

const amount = new Intl.NumberFormat("vi-VN");
const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
const trendIcon = { up: "↗", stable: "→", down: "↘" };

function HistoryPlot({ history }: Pick<PublicPriceView, "history">) {
  const fillId = useId();
  const first = history[0];
  const last = history[history.length - 1];
  const start = Date.parse(first.at);
  const duration = Date.parse(last.at) - start;
  let low = first.price;
  let high = first.price;
  for (const { price } of history) {
    low = Math.min(low, price);
    high = Math.max(high, price);
  }
  const ticks = high === low ? [low] : [high, low];
  const y = (price: number) => high === low ? 50 : 12 + 76 * (high - price) / (high - low);
  const path = history.map(({ at, price }, i) => {
    const x = duration ? 100 * (Date.parse(at) - start) / duration : 100;
    return `${i === 0 ? "M" : "L"}${x},${y(price)}`;
  }).join(" ");

  return (
    <figure className={styles.figure}>
      <figcaption>Lịch sử giá vé</figcaption>
      <div className={styles.chart}>
        <div className={styles.axis} aria-hidden="true">
          {ticks.map(price => <span key={price} style={{ top: `${y(price)}%` }}>{amount.format(price)} đ</span>)}
        </div>
        <div className={styles.plot}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
            aria-label={`Biểu đồ giá theo thời gian. Mở bán ${amount.format(first.price)} đồng, hiện tại ${amount.format(last.price)} đồng.`}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
                <stop stopColor="#0a9d91" stopOpacity=".19" />
                <stop offset="1" stopColor="#0a9d91" stopOpacity=".015" />
              </linearGradient>
            </defs>
            {ticks.map(price => <line key={price} x1="0" x2="100" y1={y(price)} y2={y(price)} className={styles.grid} />)}
            <path d={`${path} V100 H0 Z`} fill={`url(#${fillId})`} />
            <path d={path} className={styles.line} />
          </svg>
          <span className={styles.endpoint} style={{ top: `${y(last.price)}%` }} />
        </div>
        <div className={styles.dates}>
          <time dateTime={first.at}>{time.format(start)}</time>
          <time dateTime={last.at}>{time.format(Date.parse(last.at))}</time>
        </div>
      </div>
    </figure>
  );
}

export function PriceHistoryChart({ view, zoneName }: { view: PublicPriceView; zoneName: string }) {
  return (
    <section className={styles.card} aria-label={`Lịch sử giá ${zoneName}`}>
      <div className={styles.summary}>
        <strong className={styles.zone}>{zoneName}</strong>
        <div className={styles.price}>{amount.format(view.currentPrice)} đ</div>
        {view.dynamic && (
          <span className={`${styles.trend} ${styles[view.trend]}`}>
            <span aria-hidden="true">{trendIcon[view.trend]}</span>{view.trendLabel}
          </span>
        )}
        <p className={styles.meta}>
          <span>Còn {amount.format(view.seatsLeft)} chỗ</span>
          {view.dynamic && <span>{view.notice}</span>}
        </p>
      </div>
      {view.dynamic && view.history.length > 1 && <HistoryPlot history={view.history} />}
    </section>
  );
}
