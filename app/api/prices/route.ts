import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validAmount } from "@/lib/validation";
import { DomainError, PriceBounds } from "@/lib/domain";
import { eventRepository } from "@/lib/event-repository";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { zoneId, phaseId, floorPrice, basePrice, ceilingPrice } = body;

  if (
    typeof zoneId !== "string" || !zoneId ||
    typeof phaseId !== "string" || !phaseId ||
    !validAmount(floorPrice) ||
    !validAmount(basePrice) ||
    !validAmount(ceilingPrice)
  ) {
    return NextResponse.json({ error: "Dữ liệu giá không hợp lệ." }, { status: 400 });
  }


  const [zone, phase] = await Promise.all([
    prisma.zone.findUnique({ where: { id: zoneId } }),
    prisma.salePhase.findUnique({ where: { id: phaseId } }),
  ]);
  if (!zone || !phase) {
    return NextResponse.json({ error: "Không tìm thấy khu vực hoặc đợt mở bán." }, { status: 404 });
  }

  // PriceBounds enforces sàn ≤ cơ bản ≤ trần; the Event checks the phase belongs to the zone's event
  const event = await eventRepository.findById(zone.eventId);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  try {
    event.setPrice(zoneId, phaseId, PriceBounds.fromAmounts(floorPrice, basePrice, ceilingPrice));
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  await eventRepository.save(event);

  const price = await prisma.zonePrice.findUnique({ where: { zoneId_phaseId: { zoneId, phaseId } } });
  return NextResponse.json(price);
}
