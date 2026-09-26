import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { validName } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const times = parseShowTimes(startTime, endTime);
  if (!validName(name) || !times) {
    return NextResponse.json(
      { error: "Nhập tên đợt mở bán và thời gian kết thúc sau khi bắt đầu." },
      { status: 400 }
    );
  }

  if (!await prisma.event.findUnique({ where: { id } })) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  const overlap = await prisma.salePhase.findFirst({
    where: { eventId: id, startTime: { lt: times.end }, endTime: { gt: times.start } },
  });
  if (overlap) {
    return NextResponse.json({ error: "Thời gian bị trùng với đợt mở bán khác." }, { status: 400 });
  }
  const phase = await prisma.salePhase.create({
    data: {
      eventId: id,
      name: name.trim(),
      startTime: times.start,
      endTime: times.end,
    },
  });

  return NextResponse.json(phase, { status: 201 });
}
