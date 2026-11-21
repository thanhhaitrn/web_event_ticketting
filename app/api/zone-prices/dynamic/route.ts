/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  PATCH /api/zone-prices/dynamic  (S2-08, US-06)
 *
 * BTC bật/tắt định giá động cho một khu vực × đợt.
 * Body: { "zoneId": "...", "phaseId": "...", "enabled": true }
 *
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { zoneId?: string; phaseId?: string; enabled?: unknown }
    | null;

  if (typeof body?.zoneId !== "string" || !body.zoneId || typeof body.phaseId !== "string" || !body.phaseId || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "Cần zoneId, phaseId và enabled (true/false)." },
      { status: 400 },
    );
  }

  const zp = await prisma.zonePrice.findUnique({
    where: { zoneId_phaseId: { zoneId: body.zoneId, phaseId: body.phaseId } },
  });
  if (!zp) {
    return NextResponse.json({ error: "Khu vực chưa có khung giá trong đợt này." }, { status: 404 });
  }

  const updated = await prisma.zonePrice.update({
    where: { zoneId_phaseId: { zoneId: body.zoneId, phaseId: body.phaseId } },
    data: { dynamicEnabled: body.enabled },
  });
  return NextResponse.json(updated);
}
