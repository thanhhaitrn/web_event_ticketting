import { NextRequest, NextResponse } from "next/server";
import { seatService } from "@/lib/seat-service";
import { buyerIdOf } from "@/lib/buyer";
import { domainErrorResponse } from "@/lib/api-errors";

// GET /api/seats?showId=&zoneId=&from=&to=  — trạng thái ghế cho sơ đồ
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const showId = q.get("showId");
  const zoneId = q.get("zoneId");
  const from = Number(q.get("from"));
  const to = Number(q.get("to"));
  if (!showId || !zoneId || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  try {
    const status = await seatService.status({ showId, zoneId, from, to, buyerId: buyerIdOf(request) });
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return domainErrorResponse(e);
  }
}
