# Dynamic Pricing — Nhóm 3 (Sprint 2)

Code theo **Hồ sơ Phân tích Thiết kế Nhóm 3**, Phần II. Folder chia làm hai phần tách bạch:

| Folder | Nội dung | Mục trong hồ sơ | Backlog |
|---|---|---|---|
| **`01_DYNAMIC_PRICING/`** | **DYNAMIC PRICING v1.1** — định giá động rule-based: công thức giá, giới hạn thay đổi, PricingService, migration, tích hợp giữ ghế, API cho BTC | 9.1 – 9.5, UC-07, SD-05 (Hình 14), Hình 9 | S2-04, S2-05, S2-06, S2-07, S2-08, S2-10 |
| **`02_CAI_TIEN_PRICING_COPILOT/`** | **CẢI TIẾN: Pricing Copilot** — 3 thành phần: (1) Giá minh bạch, (2) Mô phỏng what-if, (3) Dự báo bán tham khảo | 9.6, "Kết quả mô phỏng" | S2-15, S2-16, S2-17 |

Các đường dẫn trong hai tài liệu được tính từ gốc dự án. Xem cách chạy trong [README chính](../README.md).

## Những điểm phát hiện khi code so với hồ sơ (nên sửa tài liệu)

1. **Ví dụ A (Bảng 12) mâu thuẫn với giới hạn 24 giờ.** Chuỗi 2.200k → 2.400k → 2.600k → 2.750k chỉ đúng nếu các bước cách nhau ≥ 24 giờ. Nếu cả chuỗi diễn ra trong 24 giờ thì giá dừng ở P24 + 30% × B = **2.600.000**. Cả hai trường hợp đều có test.
2. **Bảng 11:** dòng "≤ −0,20" ghi `10%`, đúng phải là **−10%**; "Đúng kỳ vọn" → "Đúng kỳ vọng".
3. **SD-05 (Hình 14) bước 7** vẫn ghi công thức cũ `clamp(base × (1 + a))`; v1.1 dùng `u = m / 20%` ánh xạ vào [F, Ce], và có thêm ngưỡng 2% và giới hạn 24 giờ.
4. **Bổ sung nhỏ:** nếu giới hạn 24 giờ cắt bước còn < 2% × B thì giữ nguyên giá (kiểm thử thuộc tính phát hiện các lần đổi vụn sát mép cửa sổ). Giới hạn 24 giờ cũng không bao giờ kéo giá ngược chiều mục tiêu.
5. **TP3:** hồ sơ chưa chốt ngưỡng Thấp / Vừa / Cao; code tạm dùng F̂/C < 60% / < 90% / ≥ 90% (`LEVEL_THRESHOLDS`).
6. **Mô phỏng:** v1.1 khớp sát bảng trong hồ sơ (bán nhanh 2,59 tỷ, bán đều 1,905 tỷ, đổi giá 0,2 lần/ngày). Dòng "v1 cũ" chỉ là xấp xỉ theo SD-05, nên số lần đổi giá khác bảng trong hồ sơ.
