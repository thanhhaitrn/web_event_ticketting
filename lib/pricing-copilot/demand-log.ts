import type { PrismaClient } from "@prisma/client";
import type { SnapshotHook } from "@/lib/pricing/pricing-service";

export function createDemandLogHook(db: PrismaClient): SnapshotHook {
  return async (e) => {
    await db.demandLog.createMany({
      skipDuplicates: true,
      data: {
        zoneId: e.zoneId,
        showId: e.showId,
        phaseId: e.phaseId,
        at: e.at,
        cycle: e.cycle,
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
