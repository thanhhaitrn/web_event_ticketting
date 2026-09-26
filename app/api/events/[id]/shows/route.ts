import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes, syncEventSpan } from "@/lib/shows";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const times = parseShowTimes(startTime, endTime);
  if (typeof name !== "string" || !name.trim() || !times) {
    return NextResponse.json(
      { error: "Nhập tên đêm diễn và thời gian kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy sự kiện." },
      { status: 404 },
    );
  }

  const show = await prisma.show.create({
    data: {
      eventId: id,
      name: name.trim(),
      startTime: times.start,
      endTime: times.end,
    },
  });
  await syncEventSpan(id);

  return NextResponse.json(show, { status: 201 });
}
