import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes, syncEventSpan } from "@/lib/shows";
import { DomainError } from "@/lib/domain";
import { eventRepository } from "@/lib/event-repository";

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

  // Event.removeShow keeps at least one night and drops that night's ticket counts;
  // saving also moves the event's dates to span the remaining nights
  const event = await eventRepository.findById(show.eventId);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  try {
    event.removeShow(id);
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  await eventRepository.save(event);

  return NextResponse.json({ ok: true });
}
