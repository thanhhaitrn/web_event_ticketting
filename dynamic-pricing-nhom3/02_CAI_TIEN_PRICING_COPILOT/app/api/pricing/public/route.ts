/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 1 — GIÁ MINH BẠCH
 * GET /api/pricing/public?showId=...   (công khai cho khán giả)
 *
 * Trả về cho từng khu vực: giá hiện hành, nhãn xu hướng 24 giờ, số ghế còn, lịch sử giá
 * của đợt đang mở. Không trả O/E/quy tắc và không có dự báo.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pricingRepository, PricingService } from "@/lib/pricing";
import { buildPublicPriceView } from "@/lib/pricing-copilot/transparency";

export async function GET(req: Request) {
  const showId = new URL(req.url).searchParams.get("showId");
  if (!showId) return NextResponse.json({ error: "Cần showId." }, { status: 400 });

  const now = new Date();
  const ctx = await pricingRepository.loadShowContext(showId);
  if (!ctx) return NextResponse.json({ error: "Không tìm thấy đêm diễn." }, { status: 404 });

  const idx = PricingService.activePhaseIndex(ctx.phases, now);
  if (idx < 0) return NextResponse.json({ showId, onSale: false, zones: [] });
  const phase = ctx.phases[idx];

  const counts = await pricingRepository.countSeats(showId, now);
  const changes = await prisma.priceChange.findMany({
    where: { showId, phaseId: phase.id },
    orderBy: { createdAt: "asc" },
    select: { zoneId: true, createdAt: true, newPrice: true },
  });

  const zones = ctx.zones
    .filter((z) => z.capacity > 0 && z.prices[phase.id])
    .map((z) => {
      const zp = z.prices[phase.id];
      const c = counts.get(z.zoneId) ?? { sold: 0, held: 0 };
      return buildPublicPriceView({
        zoneId: z.zoneId,
        base: zp.bounds.base,
        dynamic: zp.dynamicEnabled,
        phaseStart: phase.start,
        now,
        capacity: z.capacity,
        sold: c.sold,
        held: c.held,
        changes: changes.filter((ch) => ch.zoneId === z.zoneId),
      });
    });

  return NextResponse.json({ showId, onSale: true, phaseId: phase.id, zones });
}
