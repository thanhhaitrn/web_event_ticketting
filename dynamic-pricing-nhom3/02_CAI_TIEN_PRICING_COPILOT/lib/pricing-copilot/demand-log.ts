/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 3 — ghi DemandLog  (mục 9.6, S2-17)
 *
 * Mỗi chu kỳ recompute, hệ thống ghi DemandLog(khu vực, đêm, đợt, thời điểm, C, S, H, giá).
 * Gắn vào PricingService của phần 01 qua hook `onSnapshot` — phần 01 không cần sửa logic.
 *
 * Cách gắn (sửa 01_DYNAMIC_PRICING/lib/pricing/index.ts khi gộp vào dự án):
 *
 *   import { createDemandLogHook } from "@/lib/pricing-copilot/demand-log";
 *   export const pricingService = new PricingService(pricingRepository, {
 *     lazyRecompute: ...,
 *     onSnapshot: createDemandLogHook(prisma),
 *   });
 */
import type { PrismaClient } from "@prisma/client";
import type { SnapshotHook } from "@/lib/pricing/pricing-service";

export function createDemandLogHook(db: PrismaClient): SnapshotHook {
  return async (e) => {
    await db.demandLog.create({
      data: {
        zoneId: e.zoneId,
        showId: e.showId,
        phaseId: e.phaseId,
        at: e.at,
        capacity: e.snapshot.capacity,
        sold: e.snapshot.sold,
        held: e.snapshot.held,
        price: e.price,
      },
    });
  };
}

export async function loadDemandLog(db: PrismaClient, zoneId: string, showId: string, phaseId: string) {
  const rows = await db.demandLog.findMany({
    where: { zoneId, showId, phaseId },
    orderBy: { at: "asc" },
    select: { at: true, sold: true },
  });
  return rows;
}
