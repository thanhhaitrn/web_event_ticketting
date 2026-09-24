import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const events = await prisma.event.findMany({
    orderBy: { startTime: "asc" },
    include: { zones: true, phases: true },
  });
  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, location, startTime, endTime, saleStart, saleEnd } = body;

  if (!name || !location || !startTime || !endTime || !saleStart || !saleEnd) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc." },
      { status: 400 }
    );
  }

  const event = await prisma.event.create({
    data: {
      name,
      location,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      saleStart: new Date(saleStart),
      saleEnd: new Date(saleEnd),
    },
  });

  return NextResponse.json(event, { status: 201 });
}
