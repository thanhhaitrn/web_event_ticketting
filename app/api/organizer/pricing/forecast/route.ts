/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 3 — DỰ BÁO BÁN THAM KHẢO
 * GET /api/organizer/pricing/forecast?showId=...   (CHỈ cho BTC)
 *
 * Trước mốc 50% đợt chỉ trả visible = false. Kết quả dạng mức Thấp / Vừa / Cao,
 * nhãn "tham khảo". Không ảnh hưởng tới giá.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pricingRepository, PricingService } from "@/lib/pricing";
import { forecastSellThrough } from "@/lib/pricing-copilot/demand-forecast";
import { loadDemandLog } from "@/lib/pricing-copilot/demand-log";

export async function GET(req: Request) {
  const showId = new URL(req.url).searchParams.get("showId");
  if (!showId) return NextResponse.json({ error: "Cần showId." }, { status: 400 });

  const now = new Date();
  const ctx = await pricingRepository.loadShowContext(showId);
  if (!ctx) return NextResponse.json({ error: "Không tìm thấy đêm diễn." }, { status: 404 });
  const idx = PricingService.activePhaseIndex(ctx.phases, now);
  if (idx < 0) return NextResponse.json({ showId, zones: [] });
  const phase = ctx.phases[idx];
  const counts = await pricingRepository.countSeats(showId, now);

  const zones = await Promise.all(
    ctx.zones
      .filter((z) => z.capacity > 0)
      .map(async (z) => {
        const f = forecastSellThrough({
          capacity: z.capacity,
          sold: counts.get(z.zoneId)?.sold ?? 0,
          logs: await loadDemandLog(prisma, z.zoneId, showId, phase.id),
          phaseStart: phase.start,
          phaseEnd: phase.end,
          now,
        });
        // Không trả số ghế dự báo khi chưa đủ tin cậy.
        return f.visible
          ? { zoneId: z.zoneId, visible: true, level: f.level, levelLabel: f.levelLabel, label: f.label }
          : { zoneId: z.zoneId, visible: false, reason: f.reason };
      }),
  );
  return NextResponse.json({ showId, phaseId: phase.id, zones });
}
