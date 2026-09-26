import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name } = body;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Tên khu vực không hợp lệ." },
      { status: 400 }
    );
  }

  // ticket counts start empty; the organizer fills them in per night
  if (!await prisma.event.findUnique({ where: { id } })) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  const zone = await prisma.zone.create({
    data: { eventId: id, name: name.trim() },
    include: { prices: true, quotas: true },
  });

  return NextResponse.json(zone, { status: 201 });
}
