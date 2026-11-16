# Dynamic Pricing — Nhóm 3 (Sprint 2)

Code theo **Hồ sơ Phân tích Thiết kế Nhóm 3**, Phần II. Folder chia làm hai phần tách bạch:

| Folder | Nội dung | Mục trong hồ sơ | Backlog |
|---|---|---|---|
| **`01_DYNAMIC_PRICING/`** | **DYNAMIC PRICING v1.1** — định giá động rule-based: công thức giá, giới hạn thay đổi, PricingService, migration, tích hợp giữ ghế, API cho BTC | 9.1 – 9.5, UC-07, SD-05 (Hình 14), Hình 9 | S2-04, S2-05, S2-06, S2-07, S2-08, S2-10 |
| **`02_CAI_TIEN_PRICING_COPILOT/`** | **CẢI TIẾN: Pricing Copilot** — 3 thành phần: (1) Giá minh bạch, (2) Mô phỏng what-if, (3) Dự báo bán tham khảo | 9.6, "Kết quả mô phỏng" | S2-15, S2-16, S2-17 |

Mỗi file đều có dòng đầu ghi rõ `[PHẦN 01 — DYNAMIC PRICING v1.1]` hoặc `[PHẦN 02 — CẢI TIẾN: PRICING COPILOT] Thành phần X`.

Phần 02 **chỉ phụ thuộc một chiều** vào phần 01 (dùng lại `RuleBasedPricingPolicy` và hook `onSnapshot`). Phần 01 chạy độc lập, không import gì từ phần 02 — đúng quyết định thiết kế "dự báo không nằm trong công thức giá".

```
dynamic-pricing-nhom3/
├── 01_DYNAMIC_PRICING/                      ← DYNAMIC PRICING v1.1
│   ├── lib/pricing/
│   │   ├── types.ts                         PriceBounds, DemandSnapshot, PricingRules, PricingPolicy
│   │   ├── rules.ts                         Hằng số mặc định, K_j cộng dồn, p, làm tròn
│   │   ├── rule-based-pricing-policy.ts     ★ Công thức mục 9.4 (hàm thuần)
│   │   ├── pricing-service.ts               recompute() mỗi 15 phút, currentPrice()
│   │   ├── prisma-pricing-repository.ts     Truy cập CSDL qua Prisma
│   │   ├── in-memory-pricing-repository.ts  Repository trong bộ nhớ cho test
│   │   └── index.ts                         Singleton cho Next.js
│   ├── lib/seat-service.hold.patch.ts       S2-07: hold() dùng currentPrice, khoá giá
│   ├── app/api/pricing/recompute/route.ts   POST — cron gọi mỗi 15 phút
│   ├── app/api/pricing/history/route.ts     GET  — lịch sử giá cho BTC
│   ├── app/api/zone-prices/dynamic/route.ts PATCH — BTC bật/tắt định giá động
│   ├── prisma/                              Đoạn schema + migration SQL (S2-04)
│   └── tests/                               S2-10: unit, 4 ví dụ Bảng 12, thuộc tính, tích hợp
│
├── 02_CAI_TIEN_PRICING_COPILOT/             ← CẢI TIẾN (mục 9.6)
│   ├── lib/pricing-copilot/
│   │   ├── transparency.ts                  TP1 Giá minh bạch
│   │   ├── what-if-simulator.ts             TP2 Mô phỏng what-if (Monte Carlo)
│   │   ├── what-if-legacy.ts                TP2 công thức v1 cũ làm đối chứng
│   │   ├── demand-forecast.ts               TP3 Dự báo Gamma–Poisson
│   │   └── demand-log.ts                    TP3 Ghi DemandLog qua hook
│   ├── app/api/pricing/public/route.ts                TP1 API cho khán giả
│   ├── app/api/organizer/pricing/what-if/route.ts     TP2 API cho BTC
│   ├── app/api/organizer/pricing/forecast/route.ts    TP3 API cho BTC
│   ├── components/PriceHistoryChart.tsx     TP1 Biểu đồ lịch sử giá
│   ├── scripts/run-what-if.ts               TP2 Chạy mô phỏng từ dòng lệnh
│   ├── prisma/                              Bảng DemandLog
│   └── tests/
│
├── package.json  tsconfig.json
```

## Chạy thử

```bash
npm install
npm test          # 49 test: phần 01 (37) + phần 02 (12)
npm run what-if   # bảng so sánh giá cố định / v1 / v1.1 (giống bảng cuối mục 9)
npm run what-if -- --floor 1500000 --ceiling 2800000 --k 0.85
```

Phần lõi (công thức, service, mô phỏng, dự báo) chạy được ngay, không cần CSDL. Các file `app/`, `index.ts`, `prisma-*.ts`, `demand-log.ts`, `components/` cần dự án Next.js + Prisma thật.

## Gộp vào dự án Next.js

1. Chép `01_DYNAMIC_PRICING/lib`, `app`, `prisma` vào gốc dự án (trùng đường dẫn thư mục).
2. Thêm đoạn trong `prisma/schema.dynamic-pricing.prisma` vào `schema.prisma`, chạy `npx prisma migrate dev`.
3. Sửa `SeatService.hold()` theo `lib/seat-service.hold.patch.ts`.
4. Đặt biến môi trường `PRICING_CRON_SECRET`, cấu hình cron gọi `POST /api/pricing/recompute` mỗi 15 phút (hoặc `PRICING_LAZY_RECOMPUTE=1`).
5. (Cải tiến) Chép `02_CAI_TIEN_PRICING_COPILOT/*` tương tự, thêm bảng DemandLog, gắn `onSnapshot: createDemandLogHook(prisma)` trong `lib/pricing/index.ts`.

Import giữa hai phần dùng alias `@/lib/...` của Next.js, nên chép vào là chạy, không phải sửa đường dẫn.

## Những điểm phát hiện khi code so với hồ sơ (nên sửa tài liệu)

1. **Ví dụ A (Bảng 12) mâu thuẫn với giới hạn 24 giờ.** Chuỗi 2.200k → 2.400k → 2.600k → 2.750k chỉ đúng nếu các bước cách nhau ≥ 24 giờ. Nếu cả chuỗi diễn ra trong 24 giờ thì giá dừng ở P24 + 30% × B = **2.600.000**. Cả hai trường hợp đều có test.
2. **Bảng 11:** dòng "≤ −0,20" ghi `10%`, đúng phải là **−10%**; "Đúng kỳ vọn" → "Đúng kỳ vọng".
3. **SD-05 (Hình 14) bước 7** vẫn ghi công thức cũ `clamp(base × (1 + a))`; v1.1 dùng `u = m / 20%` ánh xạ vào [F, Ce], và có thêm ngưỡng 2% và giới hạn 24 giờ.
4. **Bổ sung nhỏ:** nếu giới hạn 24 giờ cắt bước còn < 2% × B thì giữ nguyên giá (kiểm thử thuộc tính phát hiện các lần đổi vụn sát mép cửa sổ). Giới hạn 24 giờ cũng không bao giờ kéo giá ngược chiều mục tiêu.
5. **TP3:** hồ sơ chưa chốt ngưỡng Thấp / Vừa / Cao; code tạm dùng F̂/C < 60% / < 90% / ≥ 90% (`LEVEL_THRESHOLDS`).
6. **Mô phỏng:** v1.1 khớp sát bảng trong hồ sơ (bán nhanh 2,59 tỷ, bán đều 1,905 tỷ, đổi giá 0,2 lần/ngày). Dòng "v1 cũ" chỉ là xấp xỉ theo SD-05, nên số lần đổi giá khác bảng trong hồ sơ.
