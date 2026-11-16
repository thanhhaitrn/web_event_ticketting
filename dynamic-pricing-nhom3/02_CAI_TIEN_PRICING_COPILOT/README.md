# 02 — CẢI TIẾN: Pricing Copilot (mục 9.6)

Ba thành phần dùng chung dữ liệu và hàm giá của phần 01. **Không thành phần nào thay đổi công thức giá.**

| # | Thành phần | Dành cho | File | API |
|---|---|---|---|---|
| TP1 | **Giá minh bạch** — lịch sử giá, nhãn xu hướng 24 giờ, số ghế còn | Khán giả | `lib/pricing-copilot/transparency.ts`, `components/PriceHistoryChart.tsx` | `GET /api/pricing/public?showId=` |
| TP2 | **Mô phỏng what-if** — giá cố định so với giá động theo 3 kịch bản cầu | BTC | `lib/pricing-copilot/what-if-simulator.ts`, `scripts/run-what-if.ts` | `POST /api/organizer/pricing/what-if` |
| TP3 | **Dự báo bán tham khảo** — Gamma–Poisson, bán rã 12 giờ | BTC | `lib/pricing-copilot/demand-forecast.ts`, `demand-log.ts` | `GET /api/organizer/pricing/forecast?showId=` |

## Ràng buộc thiết kế đã cài trong code

- TP1 chỉ hiển thị giá đã xảy ra: không dự đoán, không lộ O/E/quy tắc. "Ổn định" nghĩa là chênh dưới 2% × B, cùng ngưỡng với deadband.
- TP2 gọi đúng `RuleBasedPricingPolicy` của phần 01, có seed để tái lập kết quả, dùng cùng chuỗi số ngẫu nhiên cho mọi chính sách để so sánh công bằng, và kiểm đếm vi phạm biên (luôn = 0).
- TP3 chỉ hiển thị từ mốc 50% đợt, ở dạng mức Thấp / Vừa / Cao, gắn nhãn "tham khảo", và không được import vào phần 01.

## Công thức TP3

λ̂ = (α0 + n_eff) / (β0 + τ_eff), F̂ = min(C, S + λ̂·R), α0 = 12·λ0, β0 = 12, λ0 = k·C / T.
n_eff và τ_eff là số ghế bán và số giờ, cộng dồn với trọng số 0,5^(tuổi / 12 giờ).
