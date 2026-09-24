# web_event_ticketting

Công cụ quản trị (BTC) cho hệ thống bán vé sự kiện — tạo sự kiện, quản lý khu vực ghế, và thiết lập giá vé cơ bản kèm biên giá sàn/trần cho định giá động ở giai đoạn sau.

Stack: [Next.js](https://nextjs.org) (App Router, TypeScript) + [Prisma 7](https://www.prisma.io) + SQLite (driver adapter, không cần server database riêng).

## Chạy local

```bash
npm install
npx prisma migrate dev   # tạo database SQLite tại prisma/dev.db
node prisma/seed.mjs     # nạp dữ liệu mẫu (tuỳ chọn)
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Chức năng

- **Sự kiện**: tạo/sửa tên, địa điểm, thời gian tổ chức, thời gian mở bán vé.
- **Khu vực ghế**: thêm/sửa/xoá khu vực với tên và sức chứa cho từng sự kiện.
- **Giá vé**: theo từng đợt mở bán, thiết lập giá sàn / giá cơ bản / giá trần cho mỗi khu vực ghế — giá sàn/trần là biên an toàn dự phòng cho tính năng định giá động sau này.

## Cấu trúc

- `prisma/schema.prisma` — model `Event`, `Zone`, `SalePhase`, `ZonePrice`.
- `app/api/**/route.ts` — Route Handlers (REST API) cho CRUD.
- `app/events/**` — giao diện quản trị (server components + `components/EventWorkspace.tsx`).
