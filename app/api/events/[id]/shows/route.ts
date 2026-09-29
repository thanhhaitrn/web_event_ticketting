import { validBody } from "@/lib/validation";
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
  if (typeof name !== "string" || !name.trim() || !times) {
    return NextResponse.json(
      { error: "Nhập tên đêm diễn và thời gian kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }

  const event = await eventRepository.findById(id);
  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy sự kiện." },
      { status: 404 },
    );
  }

  let showId: string;
  try {
    showId = event.addShow(times, name).id;
  } catch (e) {
    return domainErrorResponse(e);
  }
  // saving also moves the event's dates to span every night
  await eventRepository.save(event);

  const show = await prisma.show.findUnique({ where: { id: showId } });
  return NextResponse.json(show, { status: 201 });
}
