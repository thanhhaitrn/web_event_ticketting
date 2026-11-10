# web_event_ticketting

Công cụ quản trị (BTC) cho hệ thống bán vé sự kiện — tạo sự kiện, quản lý khu vực ghế, và thiết lập giá vé cơ bản kèm biên giá sàn/trần cho định giá động ở giai đoạn sau.

Stack: [Next.js](https://nextjs.org) (App Router, TypeScript) + [Prisma 7](https://www.prisma.io) + PostgreSQL (driver adapter `pg`). Ảnh tải lên được lưu ở Vercel Blob (kho Private) khi có `BLOB_READ_WRITE_TOKEN`, nếu không thì ở thư mục `uploads/`; cả hai đều được phục vụ qua `/api/uploads/<tên>`.

## Biến môi trường (`.env`)

| Biến | Dùng cho |
|---|---|
| `DATABASE_URL` | kết nối Postgres của web (trên Vercel nên dùng URL qua pooler) |
| `POSTGRES_URL` | kết nối trực tiếp cho `prisma migrate`; không có thì dùng `DATABASE_URL` |
| `BLOB_READ_WRITE_TOKEN` | lưu ảnh lên Vercel Blob (kho dạng Private) |
| `ORGANIZER_PASSWORD`, `ORGANIZER_SECRET` | mật khẩu chung của trang ban tổ chức, và chuỗi bí mật để ký cookie đăng nhập. Ở máy, bỏ trống thì trang BTC mở tự do; khi deploy, thiếu thì trang BTC bị khoá |
| `TEST_DATABASE_URL` | Postgres cho test (mỗi lần chạy tạo một schema riêng rồi xoá); không đặt thì bỏ qua test cần DB |

## Chạy local

```bash
npm install
npx prisma migrate deploy   # tạo bảng trong database của DATABASE_URL / POSTGRES_URL
npm run db:seed             # nạp dữ liệu mẫu (tuỳ chọn)
npm run dev
```

Dữ liệu SQLite cũ (`prisma/dev.db`) chuyển sang một database Postgres trống bằng
`TARGET_DATABASE_URL=… npm run db:copy` (thêm `--images` để tải cả ảnh lên Blob,
`--skip-orders` để bỏ các đơn mua thử).

## Deploy (Vercel)

Vercel chạy `npm run vercel-build`: tạo Prisma client, chạy migration rồi build. Đặt các biến
môi trường ở trên trong Project Settings → Environment Variables (không đặt `SEAT_HOLD_SECONDS`).

Mở [http://localhost:3000](http://localhost:3000).

## Chức năng

- **Sự kiện**: tạo/sửa tên, địa điểm, thời gian tổ chức, thời gian mở bán vé.
- **Khu vực ghế**: thêm/sửa/xoá khu vực với tên và sức chứa cho từng sự kiện.
- **Giá vé**: theo từng đợt mở bán, thiết lập giá sàn / giá cơ bản / giá trần cho mỗi khu vực ghế — giá sàn/trần là biên an toàn dự phòng cho tính năng định giá động sau này.

## Cấu trúc

- `prisma/schema.prisma` — model `Event`, `Zone`, `SalePhase`, `ZonePrice`.
- `app/api/**/route.ts` — Route Handlers (REST API) cho CRUD.
- `app/events/**` — giao diện quản trị (server components + `components/EventWorkspace.tsx`).
