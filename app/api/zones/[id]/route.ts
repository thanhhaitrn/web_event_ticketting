import { validBody, validAmount } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Capacity } from "@/lib/domain";
import { domainErrorResponse } from "@/lib/api-errors";
import { eventRepository } from "@/lib/event-repository";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  // capacities maps a show id to that night's ticket count for this zone
  const { name, capacities } = body as {
    name?: unknown;
    capacities?: Record<string, unknown>;
  };

  const zone = await prisma.zone.findUnique({ where: { id } });
  if (!zone) {
    return NextResponse.json(
      { error: "Không tìm thấy khu vực." },
      { status: 404 },
    );
  }

  if (name !== undefined && typeof name !== "string") {
    return NextResponse.json(
      { error: "Tên khu vực không được để trống." },
      { status: 400 },
    );
  }

  if (capacities !== undefined && !validBody(capacities)) {
    return NextResponse.json({ error: "Dữ liệu số vé không hợp lệ." }, { status: 400 });
  }
  const entries = Object.entries(capacities ?? {});
  if (entries.some(([, n]) => !validAmount(n))) {
    return NextResponse.json(
      { error: "Số vé phải là số nguyên không âm." },
      { status: 400 },
    );
  }

  // the Event checks the zone's name and that every night belongs to it; nothing is saved on error
  const event = await eventRepository.findById(zone.eventId);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  try {
    if (typeof name === "string") event.zone(id)!.rename(name);
    for (const [showId, n] of entries as [string, number][]) {
      event.setCapacity(id, showId, new Capacity(n));
    }
  } catch (e) {
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  const updated = await prisma.zone.findUnique({
    where: { id },
    include: { prices: true, quotas: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.zone.findUnique({ where: { id } });
  const event = row && (await eventRepository.findById(row.eventId));
  if (!event?.zone(id)) {
    return NextResponse.json({ error: "Không tìm thấy khu vực." }, { status: 404 });
  }
  // the zone's ticket counts and prices go with it
  event.removeZone(id);
  await eventRepository.save(event);
  return NextResponse.json({ ok: true });
}
