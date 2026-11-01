import { NextRequest, NextResponse } from "next/server";
import { seatService } from "@/lib/seat-service";
import { buyerIdOf, rememberBuyer } from "@/lib/buyer";
import { validBody } from "@/lib/validation";
import { domainErrorResponse } from "@/lib/api-errors";

// GET /api/orders?showId=  — lần giữ ghế còn hạn của người này
export async function GET(request: NextRequest) {
  const showId = request.nextUrl.searchParams.get("showId");
  const buyerId = buyerIdOf(request);
  if (!showId) {
    return NextResponse.json({ error: "Thiếu đêm diễn." }, { status: 400 });
  }
  const order = buyerId ? await seatService.currentHold({ buyerId, showId }) : null;
  return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/orders { showId, zoneId, seats: number[] }  — giữ ghế 5 phút
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!validBody(body) || typeof body.showId !== "string" || typeof body.zoneId !== "string") {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const buyerId = buyerIdOf(request) ?? crypto.randomUUID();
  try {
    const order = await seatService.hold({
      buyerId,
      showId: body.showId,
      zoneId: body.zoneId,
      seats: body.seats,
    });
    return rememberBuyer(NextResponse.json(order, { status: 201 }), buyerId);
  } catch (e) {
    return domainErrorResponse(e);
  }
}
