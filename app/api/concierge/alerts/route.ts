import { NextRequest, NextResponse } from "next/server";
import { buyerIdOf } from "@/lib/buyer";
import { checkWatches, watchesFor } from "@/lib/concierge/service";

export async function GET(req: NextRequest) {
  const buyerId = buyerIdOf(req);
  if (buyerId) await checkWatches({ buyerId });
  return NextResponse.json({ watches: buyerId ? await watchesFor(buyerId) : [] }, { headers: { "Cache-Control": "private, no-store" } });
}
