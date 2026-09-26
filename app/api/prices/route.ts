import { validBody } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validAmount } from "@/lib/validation";

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

  if (floorPrice < 0 || floorPrice > ceilingPrice || basePrice < floorPrice || basePrice > ceilingPrice) {
    return NextResponse.json(
      { error: "Giá cơ bản phải nằm trong khoảng giá sàn và giá trần." },
      { status: 400 }
    );
  }

  const [zone, phase] = await Promise.all([
    prisma.zone.findUnique({ where: { id: zoneId } }),
    prisma.salePhase.findUnique({ where: { id: phaseId } }),
  ]);
  if (!zone || !phase) {
    return NextResponse.json({ error: "Không tìm thấy khu vực hoặc đợt mở bán." }, { status: 404 });
  }
  if (zone.eventId !== phase.eventId) {
    return NextResponse.json({ error: "Khu vực và đợt mở bán phải thuộc cùng sự kiện." }, { status: 400 });
  }

  const price = await prisma.zonePrice.upsert({
    where: { zoneId_phaseId: { zoneId, phaseId } },
    update: { floorPrice, basePrice, ceilingPrice },
    create: { zoneId, phaseId, floorPrice, basePrice, ceilingPrice },
  });

  return NextResponse.json(price);
}
