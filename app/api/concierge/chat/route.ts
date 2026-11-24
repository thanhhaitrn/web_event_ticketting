import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buyerIdOf, rememberBuyer } from "@/lib/buyer";
import { nightsFor, savePriceWatch } from "@/lib/concierge/service";
import { watchFromMessage } from "@/lib/concierge/watch-request";
import { GroqUnavailable, concierge } from "@/lib/concierge/graph";

export const maxDuration = 150;
const schema = z.object({
  lines: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(10),
  showId: z.string().max(100).optional(), origin: z.string().trim().max(200).optional(), requested: z.enum(["chat", "watch", "trip", "feedback"]).default("chat"),
});
let active = 0;
export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success || body.data.lines.at(-1)?.role !== "user") return NextResponse.json({ error: "Tin nhắn chưa hợp lệ." }, { status: 400 });
  if (active >= 3) return NextResponse.json({ error: "Trợ lý đang bận. Bạn thử lại sau một chút nhé." }, { status: 429 });
  active++;
  try {
    const { lines, showId, origin, requested } = body.data;
    const buyer = buyerIdOf(req);
    const nights = await nightsFor(buyer);
    const watch = requested === "chat" && watchFromMessage(lines[lines.length - 1].content, nights, showId);
    if (watch) {
      const buyerId = buyer ?? crypto.randomUUID();
      const saved = await savePriceWatch(buyerId, watch.night.id, watch.zone.id, watch.target);
      if (!saved) return NextResponse.json({ error: "Hạng vé hoặc suất diễn này đã ngừng nhận theo dõi." }, { status: 409 });
      const price = watch.target.toLocaleString("vi-VN") + " ₫";
      const response = NextResponse.json({ action: "chat", showId: watch.night.id,
        content: `Đã lưu theo dõi vé ${saved.zone.name} của ${saved.show.event.name} (${saved.show.name}). Bạn sẽ nhận tin khi hạng này còn vé và giá bằng hoặc thấp hơn ${price}. Bạn có thể xem trong mục Tin giá vé.` });
      return buyer ? response : rememberBuyer(response, buyerId);
    }
    const { reply } = await concierge.invoke({ lines, nights, requested, selected: showId ?? "", origin: origin ?? "" }, { signal: req.signal });
    return NextResponse.json(reply);
  } catch (err) {
    if (err instanceof GroqUnavailable) console.warn("Venu concierge: GroqCloud HTTP", err.status);
    return NextResponse.json({ error: "Trợ lý AI tạm thời chưa trả lời được. Bạn có thể thử lại hoặc dùng các mục bên dưới." }, { status: 503 });
  } finally { active--; }
}
