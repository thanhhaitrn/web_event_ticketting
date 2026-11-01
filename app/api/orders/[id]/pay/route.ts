import { NextRequest, NextResponse } from "next/server";
import { seatService } from "@/lib/seat-service";
import { buyerIdOf } from "@/lib/buyer";
import { domainErrorResponse } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/orders/:id/pay  — hoàn tất giao dịch (chưa nối cổng thanh toán thật)
export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const buyerId = buyerIdOf(request);
  if (!buyerId) {
    return NextResponse.json({ error: "Không tìm thấy đơn hàng." }, { status: 404 });
  }
  try {
    return NextResponse.json(await seatService.pay({ buyerId, orderId: id }));
  } catch (e) {
    return domainErrorResponse(e);
  }
}
