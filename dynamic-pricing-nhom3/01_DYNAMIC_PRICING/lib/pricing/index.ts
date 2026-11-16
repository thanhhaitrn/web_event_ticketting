/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Điểm khởi tạo singleton cho Next.js.
 *
 * `@/lib/prisma` là PrismaClient dùng chung của dự án (tạo ở Sprint 1, S1-01).
 * Nếu file đó tên khác, sửa dòng import bên dưới.
 */
import { prisma } from "@/lib/prisma";
import { PricingService } from "./pricing-service";
import { PrismaPricingRepository } from "./prisma-pricing-repository";

export const pricingRepository = new PrismaPricingRepository(prisma);

export const pricingService = new PricingService(pricingRepository, {
  // Bật nếu không có cron gọi POST /api/pricing/recompute (phương án dự phòng mục 9.5).
  lazyRecompute: process.env.PRICING_LAZY_RECOMPUTE === "1",
  // Phần 02 (cải tiến) gắn hook ghi DemandLog ở đây — xem
  // 02_CAI_TIEN_PRICING_COPILOT/lib/pricing-copilot/demand-log.ts
});

export * from "./types";
export * from "./rules";
export * from "./rule-based-pricing-policy";
export * from "./pricing-service";
