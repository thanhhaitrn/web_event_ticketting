/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 1 — GIÁ MINH BẠCH
 * GET /api/pricing/public?showId=...   (công khai cho khán giả)
 *
 * Trả về cho từng khu vực: giá hiện hành, nhãn xu hướng 24 giờ, số ghế còn, lịch sử giá
 * của đợt đang mở. Không trả O/E/quy tắc và không có dự báo.
 */
import { NextResponse } from "next/server";
import { publicShowPrices } from "@/lib/pricing-copilot/public-show-prices";

export async function GET(req: Request) {
  const showId = new URL(req.url).searchParams.get("showId");
  if (!showId) return NextResponse.json({ error: "Cần showId." }, { status: 400 });

  const result = await publicShowPrices(showId);
  return result ? NextResponse.json(result)
    : NextResponse.json({ error: "Không tìm thấy đêm diễn." }, { status: 404 });
}
