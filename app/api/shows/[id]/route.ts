import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { eventRepository } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const row = await prisma.show.findUnique({ where: { id } });
  const event = row && (await eventRepository.findById(row.eventId));
  const show = event?.show(id);
  if (!event || !show) {
    return NextResponse.json(
      { error: "Không tìm thấy đêm diễn." },
      { status: 404 },
    );
  }

  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json(
      { error: "Tên đêm diễn không được để trống." },
      { status: 400 },
    );
  }

  const current = show.getTime();
  const times = parseShowTimes(
    startTime === undefined ? current.start.toISOString() : startTime,
    endTime === undefined ? current.end.toISOString() : endTime,
  );
  if (!times) {
    return NextResponse.json(
      { error: "Đêm diễn phải kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }

  try {
    if (typeof name === "string") show.rename(name);
    show.reschedule(times);
  } catch (e) {
    return domainErrorResponse(e);
  }
  // saving also moves the event's dates to span every night
  await eventRepository.save(event);

  return NextResponse.json(await prisma.show.findUnique({ where: { id } }));
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
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  return NextResponse.json({ ok: true });
}
