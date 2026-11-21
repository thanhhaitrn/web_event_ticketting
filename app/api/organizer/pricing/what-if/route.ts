/**
 * [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 2 — MÔ PHỎNG WHAT-IF
 * POST /api/organizer/pricing/what-if   (cho BTC)
 *
 * Body (mọi trường tuỳ chọn):
 * {
 *   "capacity": 1000,
 *   "bounds": { "floor": 1600000, "base": 2000000, "ceiling": 3000000 },
 *   "phaseDays": 10, "k": 0.9, "runs": 200,
 *   "scenarios": [{ "name": "Bán nhanh", "demandRatio": 1.6, "shape": "front" }]
 * }
 */
import { NextResponse } from "next/server";
import { runWhatIf, type WhatIfInput } from "@/lib/pricing-copilot/what-if-simulator";

export async function POST(req: Request) {
  const body = ((await req.json().catch(() => ({}))) ?? {}) as Partial<WhatIfInput>;
  try {
    const results = runWhatIf({
      ...body,
      runs: Math.min(body.runs ?? 200, 500), // giới hạn thời gian phản hồi
    });
    return NextResponse.json({
      note: "Mô hình cầu giả định — chỉ dùng để so sánh giá cố định với giá động.",
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
