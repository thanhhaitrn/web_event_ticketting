import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buyerIdOf, rememberBuyer } from "@/lib/buyer";
import { prisma } from "@/lib/prisma";
import { nightsFor, savePriceWatch } from "@/lib/concierge/service";

const id = z.string().min(1).max(100);
const command = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("watch"), showId: id, zoneId: id, target: z.number().int().min(0).max(2147483647) }),
  z.object({ kind: z.literal("remove"), id }),
  z.object({ kind: z.literal("read"), id }),
  z.object({ kind: z.literal("feedback"), showId: id, rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000) }),
]);
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
export async function GET(req: NextRequest) {
  return NextResponse.json({ nights: await nightsFor(buyerIdOf(req)) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(req: NextRequest) {
  const parsed = command.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Bạn kiểm tra lại thông tin vừa nhập nhé.", 400);
  const data = parsed.data;
  const buyer = buyerIdOf(req);
  if (data.kind === "watch") {
    const buyerId = buyer ?? crypto.randomUUID();
    if (!await savePriceWatch(buyerId, data.showId, data.zoneId, data.target)) return error("Hạng vé hoặc suất diễn này đã ngừng nhận theo dõi.", 409);
    // The subscription is already durable; the inbox and cron handle the actual price check.
    const response = NextResponse.json({ ok: true });
    return buyer ? response : rememberBuyer(response, buyerId);
  }
  if (!buyer) return error("Bạn hãy mở Venu bằng trình duyệt đã dùng để đặt vé hoặc theo dõi giá.", 403);
  if (data.kind === "feedback") {
    const paid = await prisma.order.findFirst({ where: { buyerId: buyer, status: "PAID", showId: data.showId,
      show: { endTime: { lte: new Date() } } }, select: { id: true } });
    if (!paid) return error("Bạn có thể gửi cảm nhận sau khi suất diễn đã mua vé kết thúc.", 403);
    const key = { buyerId: buyer, showId: data.showId };
    const values = { rating: data.rating, comment: data.comment };
    await prisma.eventFeedback.upsert({ where: { buyerId_showId: key }, create: { ...key, ...values }, update: values });
  } else if (data.kind === "remove") {
    await prisma.priceWatch.deleteMany({ where: { buyerId: buyer, id: data.id } });
  } else {
    await prisma.priceWatch.updateMany({ where: { buyerId: buyer, id: data.id, matchedAt: { not: null }, readAt: null }, data: { readAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
