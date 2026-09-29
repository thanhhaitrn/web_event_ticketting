import { validBody, validName } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { eventRepository } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

/** the phase's event as an aggregate, or null when the phase doesn't exist */
async function eventOfPhase(id: string) {
  const row = await prisma.salePhase.findUnique({ where: { id } });
  const event = row && (await eventRepository.findById(row.eventId));
  return event?.phase(id) ? event : null;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const event = await eventOfPhase(id);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy đợt mở bán." }, { status: 404 });
  }
  const current = event.phase(id)!.getTime();
  const times = parseShowTimes(
    startTime === undefined ? current.start.toISOString() : startTime,
    endTime === undefined ? current.end.toISOString() : endTime,
  );
  if ((name !== undefined && !validName(name)) || !times) {
    return NextResponse.json({ error: "Nhập tên đợt mở bán và thời gian kết thúc sau khi bắt đầu." }, { status: 400 });
  }

  try {
    if (typeof name === "string") event.phase(id)!.rename(name);
    // Event rejects a new time that overlaps another phase
    event.reschedulePhase(id, times);
  } catch (e) {
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  return NextResponse.json(await prisma.salePhase.findUnique({ where: { id } }));
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await eventOfPhase(id);
  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy đợt mở bán." },
      { status: 404 },
    );
  }
  // the phase's prices go with it, in the aggregate and in the database
  event.removeSalePhase(id);
  await eventRepository.save(event);
  return NextResponse.json({ ok: true });
}
