import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes, syncEventSpan } from "@/lib/shows";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const current = await prisma.show.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json(
      { error: "Không tìm thấy đêm diễn." },
      { status: 404 },
    );
  }

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json(
      { error: "Tên đêm diễn không được để trống." },
      { status: 400 },
    );
  }

  const times = parseShowTimes(
    startTime === undefined ? current.startTime.toISOString() : startTime,
    endTime === undefined ? current.endTime.toISOString() : endTime,
  );
  if (!times) {
    return NextResponse.json(
      { error: "Đêm diễn phải kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }

  const show = await prisma.show.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      startTime: times.start,
      endTime: times.end,
    },
  });
  await syncEventSpan(show.eventId);

  return NextResponse.json(show);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show) {
    return NextResponse.json(
      { error: "Không tìm thấy đêm diễn." },
      { status: 404 },
    );
  }

  // an event always keeps at least one night, which is where its dates come from
  const count = await prisma.show.count({ where: { eventId: show.eventId } });
  if (count <= 1) {
    return NextResponse.json(
      { error: "Sự kiện cần ít nhất một đêm diễn." },
      { status: 400 },
    );
  }

  await prisma.show.delete({ where: { id } });
  await syncEventSpan(show.eventId);

  return NextResponse.json({ ok: true });
}
