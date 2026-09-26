import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { validName } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const current = await prisma.salePhase.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Không tìm thấy đợt mở bán." }, { status: 404 });
  }
  const times = parseShowTimes(
    startTime === undefined ? current.startTime.toISOString() : startTime,
    endTime === undefined ? current.endTime.toISOString() : endTime,
  );
  if ((name !== undefined && !validName(name)) || !times) {
    return NextResponse.json({ error: "Nhập tên đợt mở bán và thời gian kết thúc sau khi bắt đầu." }, { status: 400 });
  }
  const overlap = await prisma.salePhase.findFirst({
    where: { eventId: current.eventId, id: { not: id }, startTime: { lt: times.end }, endTime: { gt: times.start } },
  });
  if (overlap) {
    return NextResponse.json({ error: "Thời gian bị trùng với đợt mở bán khác." }, { status: 400 });
  }

  const phase = await prisma.salePhase.update({
    where: { id },
    data: {
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      startTime: times.start,
      endTime: times.end,
    },
  });

  return NextResponse.json(phase);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const phase = await prisma.salePhase.findUnique({ where: { id } });
  if (!phase) {
    return NextResponse.json(
      { error: "Không tìm thấy đợt mở bán." },
      { status: 404 },
    );
  }
  // the phase's zone prices are removed with it (onDelete: Cascade)
  await prisma.salePhase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
