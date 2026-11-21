/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  GET /api/pricing/history?showId=&zoneId=&phaseId=  (S2-08, US-06)
 *
 * Lịch sử giá cho BTC: từng lần đổi giá kèm thời điểm, tỷ lệ lấp đầy, kỳ vọng và quy tắc.
 * (Khán giả dùng endpoint công khai rút gọn ở phần 02 — Giá minh bạch.)
 */
import { NextResponse } from "next/server";
import { pricingRepository } from "@/lib/pricing";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const showId = url.searchParams.get("showId");
  const zoneId = url.searchParams.get("zoneId");
  const phaseId = url.searchParams.get("phaseId") ?? undefined;
  if (!showId || !zoneId) {
    return NextResponse.json({ error: "Cần showId và zoneId." }, { status: 400 });
  }

  const rows = await pricingRepository.history(zoneId, showId, phaseId);
  return NextResponse.json(
    rows.map((r) => ({
      at: r.createdAt,
      phaseId: r.phaseId,
      oldPrice: r.oldPrice,
      newPrice: r.newPrice,
      occupancy: r.occupancy,
      expected: r.expected,
      rule: r.rule,
    })),
  );
}
