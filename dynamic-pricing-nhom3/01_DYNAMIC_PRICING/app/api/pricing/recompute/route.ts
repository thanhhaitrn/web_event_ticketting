/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  POST /api/pricing/recompute  (mục 9.5 "Chạy định kỳ", S2-06)
 *
 * Endpoint nội bộ do cron gọi mỗi 15 phút, ví dụ:
 *   *\/15 * * * *  curl -X POST -H "x-cron-secret: $PRICING_CRON_SECRET" https://<host>/api/pricing/recompute
 *
 * Body tuỳ chọn: { "showId": "..." } — bỏ trống thì tính cho mọi đêm có đợt đang mở.
 */
import { NextResponse } from "next/server";
import { pricingService } from "@/lib/pricing";

export async function POST(req: Request) {
  const secret = process.env.PRICING_CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Không có quyền." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { showId?: string };
  const now = new Date();
  const changes = body.showId
    ? await pricingService.recompute(body.showId, now)
    : await pricingService.recomputeAll(now);

  return NextResponse.json({ at: now.toISOString(), changed: changes.length, changes });
}
