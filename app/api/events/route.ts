import { validBody, validName } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { isValidImageUrl } from "@/lib/uploads";
import { Event, ImageRef, Venue } from "@/lib/domain";
import { eventRepository, findGenres, findProvince } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";

export async function GET() {
  const events = await prisma.event.findMany({
    orderBy: { startTime: "asc" },
    include: { zones: { include: { quotas: true } }, phases: true, shows: true },
  });
  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!validBody(body)) {
    return NextResponse.json({ error: "Dữ liệu yêu cầu không hợp lệ." }, { status: 400 });
  }
  const {
    name,
    artist,
    imageUrl,
    genreSlugs,
    location,
    provinceCode,
    startTime,
    endTime,
    saleStart,
    saleEnd,
  } = body;

  // định dạng dữ liệu gửi lên; quy tắc nghiệp vụ nằm trong Event.create
  if (!validName(name) || !validName(location) || (artist != null && typeof artist !== "string")) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc." },
      { status: 400 },
    );
  }

  const times = parseShowTimes(startTime, endTime);
  if (!times) {
    return NextResponse.json(
      { error: "Sự kiện phải kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }
  const saleTimes = parseShowTimes(saleStart, saleEnd);
  if (!saleTimes) {
    return NextResponse.json({ error: "Lịch mở bán không hợp lệ: kết thúc phải sau bắt đầu, và mở bán không được sau đêm diễn đầu tiên." }, { status: 400 });
  }

  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "Ảnh quảng bá không hợp lệ." },
      { status: 400 },
    );
  }

  const genres = genreSlugs === undefined ? [] : await findGenres(genreSlugs);
  if (genres === null) {
    return NextResponse.json(
      { error: "Vui lòng chọn thể loại từ danh sách." },
      { status: 400 },
    );
  }

  const province = await findProvince(provinceCode);
  if (!province) {
    return NextResponse.json(
      { error: "Vui lòng chọn tỉnh/thành từ danh sách." },
      { status: 400 },
    );
  }

  let event: Event;
  try {
    // tạo sẵn "Đêm 1"; thêm đêm khác ở tab "Đêm diễn"
    event = Event.create({
      name,
      artist: typeof artist === "string" ? artist : undefined,
      venue: new Venue(location.trim(), province),
      genres,
      saleWindow: saleTimes,
      firstShow: times,
      image: imageUrl ? ImageRef.parse(imageUrl) : undefined,
    });
  } catch (e) {
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  const saved = await prisma.event.findUnique({ where: { id: event.id } });
  return NextResponse.json(saved, { status: 201 });
}
