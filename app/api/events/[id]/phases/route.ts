import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, startTime, endTime } = body;

  if (!name || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Thiếu tên hoặc thời gian của đợt mở bán." },
      { status: 400 }
    );
  }

  const phase = await prisma.salePhase.create({
    data: {
      eventId: id,
      name,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    },
  });

  return NextResponse.json(phase, { status: 201 });
}
