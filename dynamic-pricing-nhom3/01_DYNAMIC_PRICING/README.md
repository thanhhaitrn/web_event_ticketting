# 01 — DYNAMIC PRICING v1.1 (FR-14, NFR-03)

Phần chính của Sprint 2, theo mục 9.1 – 9.5 của hồ sơ.

## Công thức (mục 9.4) → code

| Công thức | Hàm |
|---|---|
| O = S / C, E = K_(j−1) + (K_j − K_(j−1))·p, D = O − E | `occupancy()`, `expected()` |
| K_j = k × thời lượng cộng dồn / tổng thời lượng | `cumulativeExpected()` |
| a_cầu (3 nhánh, điều kiện S ≥ max(5, 2% × C)) | `demandAdjustment()` |
| a_giờ_chót = −10% nếu ≤ 72 giờ và O < 50% | `lastMinuteAdjustment()` |
| a_giữ = +5% nếu H ≥ max(5, 15% × (C − S)) | `holdAdjustment()` |
| m = clamp(Σa, ±20%), u = m / 20%, P′ ánh xạ vào [F, Ce] | `RuleBasedPricingPolicy.evaluate()`, `targetPrice()` |
| Ngưỡng 2% × B, bước 10% × B, P24 ± 30% × B, [F, Ce] | `applyChangeLimits()` |

## Luồng (SD-05)

`POST /api/pricing/recompute` → `PricingService.recompute(showId, now)` → với mỗi khu vực có `dynamicEnabled` trong đợt đang mở: tạo `DemandSnapshot` → `policy.quote()` → nếu giá đổi thì ghi `PriceChange` (khoá duy nhất theo chu kỳ 15 phút, nên recompute gọi trùng cũng chỉ ghi một dòng).

`SeatService.hold()` → `PricingService.currentPrice()` → giá ghi vào `SeatReservation.price` và được khoá trong 5 phút giữ ghế.

## Kiểm thử (S2-10)

`tests/rule-based-pricing-policy.test.ts`: mọi nhánh a_cầu tại D = −0,20 … +0,20, điều kiện số ghế bán, 4 ví dụ Bảng 12, ngưỡng 2%, bước 10%, làm tròn, giới hạn 24 giờ, kẹp biên, và kiểm thử thuộc tính 20.000 ca **có bật** ngưỡng 2% và giới hạn 24 giờ (phần hồ sơ ghi là chưa làm).

`tests/pricing-service.test.ts`: giá khoá khi giữ ghế, chống ghi trùng khi chạy song song, bỏ qua C = 0 hoặc ngoài thời gian đợt, sang đợt 2 bắt đầu ở giá cơ bản mới, giới hạn 24 giờ qua nhiều chu kỳ, recompute lười.
