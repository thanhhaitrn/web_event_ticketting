import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, startTime, endTime } = body;

  const phase = await prisma.salePhase.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(startTime !== undefined ? { startTime: new Date(startTime) } : {}),
      ...(endTime !== undefined ? { endTime: new Date(endTime) } : {}),
    },
  });

  return NextResponse.json(phase);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.salePhase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
