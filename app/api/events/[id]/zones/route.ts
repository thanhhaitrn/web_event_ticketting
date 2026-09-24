import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json();
  const { name, capacity } = body;

  if (!name || typeof capacity !== "number" || capacity < 0) {
    return NextResponse.json(
      { error: "Tên khu vực và sức chứa không hợp lệ." },
      { status: 400 }
    );
  }

  const zone = await prisma.zone.create({
    data: { eventId: id, name, capacity },
    include: { prices: true },
  });

  return NextResponse.json(zone, { status: 201 });
}
