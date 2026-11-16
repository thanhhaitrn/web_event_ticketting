/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  S2-07: tích hợp giá động vào SeatService.hold()
 * Hồ sơ PTTK mục 9.2.4, 9.5 "Tích hợp", SD-05 bước 12–16.
 *
 * ĐÂY LÀ BẢN VÁ MẪU, không thay thế SeatService của Sprint 1. Chỉ cần đổi đúng chỗ
 * lấy giá trong hold():
 *
 *   TRƯỚC (Sprint 1):
 *     const unitPrice = zonePrice.basePrice;
 *
 *   SAU (Sprint 2):
 *     const unitPrice = await resolveHoldPrice(pricingService, showId, zoneId, now);
 *
 * rồi giữ nguyên phần ghi SeatReservation.price = unitPrice và
 * Order.totalAmount = unitPrice × số ghế. Giá được KHOÁ trong 5 phút giữ ghế:
 * pay() đọc lại SeatReservation.price/Order.totalAmount, KHÔNG gọi currentPrice() lần nữa.
 */
import type { PricingService } from "./pricing/pricing-service";
import type { Money } from "./pricing/types";

export class NoActivePriceError extends Error {
  constructor() {
    super("Khu vực chưa có giá trong đợt đang mở.");
  }
}

/** Đọc giá hiện hành TRƯỚC transaction giữ ghế (đọc thuần, không khoá). */
export async function resolveHoldPrice(
  pricing: Pick<PricingService, "currentPrice">,
  showId: string,
  zoneId: string,
  now: Date = new Date(),
): Promise<Money> {
  const price = await pricing.currentPrice(showId, zoneId, now);
  if (price == null) throw new NoActivePriceError();
  return price;
}

/*
 * Ví dụ trong SeatService (Sprint 1, rút gọn):
 *
 *   async hold(buyerId, showId, zoneId, seats: number[]): Promise<OrderView> {
 *     const now = new Date();
 *     const unitPrice = await resolveHoldPrice(pricingService, showId, zoneId, now); // ← mới
 *     return prisma.$transaction(async (tx) => {
 *       await this.releaseExpired(tx, now);
 *       const order = await tx.order.create({
 *         data: { buyerId, showId, status: "HELD", activeKey: `${buyerId}:${showId}`,
 *                 expiresAt: addMinutes(now, 5), totalAmount: unitPrice * seats.length },
 *       });
 *       await tx.seatReservation.createMany({
 *         data: seats.map((n) => ({ orderId: order.id, showId, zoneId, seatNumber: n,
 *                                   status: "HELD", expiresAt: order.expiresAt,
 *                                   price: unitPrice })),                          // ← giá khoá
 *       });
 *       ...
 *     });
 *   }
 */
