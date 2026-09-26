import { validBody, validAmount } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return NextResponse.json(
      { error: "Tên khu vực không được để trống." },
      { status: 400 },
    );
  }

  if (capacities !== undefined && !validBody(capacities)) {
    return NextResponse.json({ error: "Dữ liệu số vé không hợp lệ." }, { status: 400 });
  }
  const entries = Object.entries(capacities ?? {});
  if (
    entries.some(
      ([, n]) => !validAmount(n),
    )
  ) {
    return NextResponse.json(
      { error: "Số vé phải là số nguyên không âm." },
      { status: 400 },
    );
  }
  if (entries.length > 0) {
    const owned = await prisma.show.count({
      where: { id: { in: entries.map(([showId]) => showId) }, eventId: zone.eventId },
    });
    if (owned !== entries.length) {
      return NextResponse.json(
        { error: "Đêm diễn không thuộc sự kiện này." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const [showId, capacity] of entries as [string, number][]) {
      await tx.zoneQuota.upsert({
        where: { zoneId_showId: { zoneId: id, showId } },
        create: { zoneId: id, showId, capacity },
        update: { capacity },
      });
    }
    return tx.zone.update({
      where: { id },
      data: typeof name === "string" ? { name: name.trim() } : {},
      include: { prices: true, quotas: true },
    });
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
