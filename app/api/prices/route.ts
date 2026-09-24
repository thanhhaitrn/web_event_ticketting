import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { zoneId, phaseId, floorPrice, basePrice, ceilingPrice } = body;

  if (
    !zoneId ||
    !phaseId ||
    typeof floorPrice !== "number" ||
    typeof basePrice !== "number" ||
    typeof ceilingPrice !== "number"
  ) {
    return NextResponse.json({ error: "Dữ liệu giá không hợp lệ." }, { status: 400 });
  }

  if (floorPrice < 0 || floorPrice > ceilingPrice || basePrice < floorPrice || basePrice > ceilingPrice) {
    return NextResponse.json(
      { error: "Giá cơ bản phải nằm trong khoảng giá sàn và giá trần." },
      { status: 400 }
    );
  }

  const price = await prisma.zonePrice.upsert({
    where: { zoneId_phaseId: { zoneId, phaseId } },
    update: { floorPrice, basePrice, ceilingPrice },
    create: { zoneId, phaseId, floorPrice, basePrice, ceilingPrice },
  });

  return NextResponse.json(price);
}
