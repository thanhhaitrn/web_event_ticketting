import Link from "next/link";
import { getEvents } from "@/lib/data";
import { placeLabel } from "@/lib/provinces";

const moneyFmt = new Intl.NumberFormat("vi-VN");
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
});

export default async function OrganizerLandingPage() {
  const events = getEvents().slice(0, 4);

  // only priced events belong on a signed-out page; "chưa đặt giá" is internal setup state
  const showcase = events
    .map((ev) => {
      const prices = ev.zones.flatMap((z) => z.prices);
      return {
        ev,
        lowest: prices.length
          ? Math.min(...prices.map((p) => p.basePrice))
          : null,
      };
    })
    .filter((row) => row.lowest !== null)
    .slice(0, 3);

  return (
    <>
      <section className="org-hero">
        <div className="org-hero-inner">
          <div className="org-hero-copy">
            <h1>
              <span className="thin">Sự kiện của bạn,</span>
              <span className="bold">giá vé được AI tối ưu</span>
            </h1>
            <p>
              Bạn thiết lập giá sàn và giá trần, AI tự động tối ưu giá vé trong
              từng đợt mở bán dựa trên nhu cầu thực tế — luôn nằm trong biên giá
              do ban tổ chức kiểm soát.
            </p>
            <Link href="/organizer/events" className="org-btn hero-cta">
              Bắt đầu miễn phí
            </Link>
          </div>

          <div className="org-hero-visual">
            {/* tags are anchored to the card's corners, so they never cover its text */}
            <div className="tour-wrap">
              <span className="float-tag f1">Khu vực ghế</span>
              <span className="float-tag f2">Giá sàn &amp; giá trần</span>
              <span className="float-tag f3">Đợt mở bán</span>
              <span className="float-tag f4">Định giá động</span>

              <div className="tour-card">
                <div className="tour-card-head">Bảng giá đang áp dụng</div>
                {showcase.length === 0 ? (
                  <div className="tour-row">
                    <div>
                      <b>Bảng giá của bạn</b>
                      <span>Giá từng khu vực sẽ hiển thị ở đây</span>
                    </div>
                  </div>
                ) : (
                  showcase.map(({ ev, lowest }) => (
                    <div className="tour-row" key={ev.id}>
                      <div>
                        <b>{ev.name}</b>
                        <span>
                          {dateFmt.format(ev.startTime)} ·{" "}
                          {placeLabel(ev.location, ev.province)}
                        </span>
                      </div>
                      <span className="tour-price">
                        từ {moneyFmt.format(lowest!)}₫
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- scroll block 1: what you set up ---------- */}
      <section className="org-block">
        <div className="org-block-inner">
          <div className="block-head">
            <h2>Bán hết vé nhanh hơn, đúng giá hơn</h2>
            <p>
              Thiết lập một lần, giá vé tự tối ưu theo nhu cầu thực tế suốt đợt
              mở bán.
            </p>
          </div>

          <div className="promo-grid">
            <article className="promo">
              <div className="promo-visual">
                <div className="mock">
                  <span className="mock-label">Tên sự kiện</span>
                  <div className="mock-field">Concert Mùa Hè Rực Rỡ 2026</div>
                  <span className="mock-label">Địa điểm</span>
                  <div className="mock-field">SVĐ Mỹ Đình, Hà Nội</div>
                  <div className="mock-row">
                    <div>
                      <span className="mock-label">Bắt đầu</span>
                      <div className="mock-field">14/11 · 19:00</div>
                    </div>
                    <div>
                      <span className="mock-label">Kết thúc</span>
                      <div className="mock-field">14/11 · 22:30</div>
                    </div>
                  </div>
                </div>
              </div>
              <h3>Thiết lập sự kiện</h3>
              <ul>
                <li>Khai báo thời gian, địa điểm và lịch mở bán</li>
                <li>Quản lý toàn bộ thông tin sự kiện tại một nơi</li>
                <li>Sẵn sàng áp dụng AI khi bắt đầu bán vé</li>
              </ul>
            </article>

            <article className="promo">
              <div className="promo-visual">
                <div className="mock">
                  <div className="mock-head">Khu vực ghế</div>
                  <div className="mock-line">
                    <span>VIP — Kim Cương</span>
                    <b>450</b>
                  </div>
                  <div className="mock-line">
                    <span>Hạng 1 — Vàng</span>
                    <b>900</b>
                  </div>
                  <div className="mock-line">
                    <span>Hạng 2 — Bạc</span>
                    <b>1.600</b>
                  </div>
                  <div className="mock-line">
                    <span>Đứng — Sân khấu</span>
                    <b>1.000</b>
                  </div>
                </div>
              </div>
              <h3>Chia khu vực ghế</h3>
              <ul>
                <li>Thiết lập sức chứa cho từng khu vực</li>
                <li>Quản lý lượng vé còn lại theo thời gian thực</li>
                <li>Dữ liệu bán vé được dùng để AI đánh giá nhu cầu</li>
              </ul>
            </article>

            <article className="promo">
              <div className="promo-visual">
                <div className="mock">
                  <div className="mock-head">Đợt 1 — Early Bird</div>
                  <div className="mock-price-row">
                    <span>VIP — Kim Cương</span>
                    <div className="mock-chips">
                      <span className="mp floor">sàn 2.000.000</span>
                      <span className="mp base">cơ bản 2.500.000</span>
                      <span className="mp ceil">trần 3.200.000</span>
                    </div>
                  </div>
                  <div className="mock-price-row">
                    <span>Hạng 1 — Vàng</span>
                    <div className="mock-chips">
                      <span className="mp floor">sàn 1.200.000</span>
                      <span className="mp base">cơ bản 1.500.000</span>
                      <span className="mp ceil">trần 1.900.000</span>
                    </div>
                  </div>
                </div>
              </div>
              <h3>Thiết lập biên giá cho AI</h3>
              <ul>
                <li>Đặt giá cơ bản cho từng khu vực và đợt bán</li>
                <li>Xác định giá sàn – giá trần trước khi mở bán</li>
                <li>AI chỉ được điều chỉnh giá trong phạm vi bạn cho phép</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- scroll block 2: how the bounds protect you ---------- */}
      <section className="org-block tinted">
        <div className="org-block-inner">
          <div className="block-head center">
            <h2>Biên giá luôn do bạn kiểm soát</h2>
            <p>
              AI tìm mức giá phù hợp nhất để tối ưu doanh thu — nhưng không bao
              giờ vượt khỏi giới hạn bạn đặt ra.
            </p>
          </div>

          <div className="support-grid">
            <article className="support">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M6 32h36" strokeLinecap="round" />
                <path d="M12 32V20M24 32V12M36 32V24" strokeLinecap="round" />
              </svg>
              <h3>Giá sàn</h3>
              <p className="support-lead">Bảo vệ mức doanh thu tối thiểu.</p>
              <p>
                AI có thể giảm giá khi nhu cầu thấp, nhưng không bao giờ thấp
                hơn giá sàn do bạn thiết lập.
              </p>
            </article>

            <article className="support">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <rect x="8" y="14" width="32" height="20" rx="4" />
                <path d="M8 22h32" />
                <path d="M18 28h6" strokeLinecap="round" />
              </svg>
              <h3>Giá trần</h3>
              <p className="support-lead">Kiểm soát mức tăng giá tối đa.</p>
              <p>
                Khi nhu cầu tăng mạnh, AI có thể nâng giá để tối ưu doanh thu
                nhưng không bao giờ vượt quá giá trần.
              </p>
            </article>

            <article className="support">
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path
                  d="M4 24s7-11 20-11 20 11 20 11-7 11-20 11S4 24 4 24z"
                  strokeLinejoin="round"
                />
                <circle cx="24" cy="24" r="5.5" />
              </svg>
              <h3>AI an toàn &amp; minh bạch</h3>
              <p className="support-lead">
                Dynamic pricing nhưng không mất kiểm soát.
              </p>
              <p>
                Mọi mức giá AI đưa ra đều nằm trong biên cho phép, giúp hạn chế
                biến động giá bất hợp lý và bảo vệ trải nghiệm người mua.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- closing call to action ---------- */}
      <section className="org-cta">
        <div className="org-cta-inner">
          <div>
            <h2>Sẵn sàng mở bán sự kiện đầu tiên?</h2>
            <p>
              Dựng sự kiện, chia khu vực ghế và đặt giá vé chỉ trong vài phút.
            </p>
            <Link href="/organizer/events" className="org-btn hero-cta">
              Bắt đầu miễn phí
            </Link>
          </div>
          <div className="org-cta-card">
            <div className="tour-card-head">Đợt 2 — Chính thức</div>
            <div className="mock-price-row light">
              <span>Hạng 2 — Bạc</span>
              <div className="mock-chips">
                <span className="mp floor">sàn 800.000</span>
                <span className="mp base">cơ bản 1.000.000</span>
                <span className="mp ceil">trần 1.300.000</span>
              </div>
            </div>
            <div className="mock-price-row light">
              <span>Đứng — Sân khấu</span>
              <div className="mock-chips">
                <span className="mp floor">sàn 320.000</span>
                <span className="mp base">cơ bản 400.000</span>
                <span className="mp ceil">trần 520.000</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
