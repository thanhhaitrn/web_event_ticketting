import { validBody, validName } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { eventRepository } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { name, startTime, endTime } = body;

  const times = parseShowTimes(startTime, endTime);
  if (!validName(name) || !times) {
    return NextResponse.json(
      { error: "Nhập tên đợt mở bán và thời gian kết thúc sau khi bắt đầu." },
      { status: 400 }
    );
  }

  const event = await eventRepository.findById(id);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }

  let phaseId: string;
  try {
    // Event rejects a phase that overlaps another one of the same event
    phaseId = event.addSalePhase(name, times).id;
  } catch (e) {
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  const phase = await prisma.salePhase.findUnique({ where: { id: phaseId } });
  return NextResponse.json(phase, { status: 201 });
}
