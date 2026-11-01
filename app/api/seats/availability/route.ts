import { NextRequest, NextResponse } from "next/server";
import { seatService } from "@/lib/seat-service";

// GET /api/seats/availability?showId=  — số ghế còn trống theo khu vực
export async function GET(request: NextRequest) {
  const showId = request.nextUrl.searchParams.get("showId");
  if (!showId) {
    return NextResponse.json({ error: "Thiếu đêm diễn." }, { status: 400 });
  }
  return NextResponse.json(await seatService.availability(showId), {
    headers: { "Cache-Control": "no-store" },
  });
}
