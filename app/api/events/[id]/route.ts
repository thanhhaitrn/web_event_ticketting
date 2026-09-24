import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      zones: { orderBy: { createdAt: "asc" }, include: { prices: true } },
      phases: { orderBy: { startTime: "asc" } },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }

  return NextResponse.json(event);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, location, startTime, endTime, saleStart, saleEnd } = body;

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(startTime !== undefined ? { startTime: new Date(startTime) } : {}),
      ...(endTime !== undefined ? { endTime: new Date(endTime) } : {}),
      ...(saleStart !== undefined ? { saleStart: new Date(saleStart) } : {}),
      ...(saleEnd !== undefined ? { saleEnd: new Date(saleEnd) } : {}),
    },
  });

  return NextResponse.json(event);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
