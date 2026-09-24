import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, capacity } = body;

  const zone = await prisma.zone.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    },
  });

  return NextResponse.json(zone);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await prisma.zone.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
