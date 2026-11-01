import { NextRequest, NextResponse } from "next/server";
import { seatService } from "@/lib/seat-service";
import { buyerIdOf } from "@/lib/buyer";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/orders/:id  — huỷ giữ ghế, ghế trống lại ngay
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const buyerId = buyerIdOf(request);
  if (buyerId) await seatService.cancel({ buyerId, orderId: id });
  return NextResponse.json({ ok: true });
}
