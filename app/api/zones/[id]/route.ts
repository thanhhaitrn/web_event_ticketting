import { validBody, validAmount } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Capacity, DomainError } from "@/lib/domain";
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
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
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
  const result = await prisma.zone.deleteMany({ where: { id } });
  if (!result.count) {
    return NextResponse.json({ error: "Không tìm thấy khu vực." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
