import { validBody, validName } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseShowTimes } from "@/lib/shows";
import { checkGenreSlugs } from "@/lib/genres";
import { isValidImageUrl } from "@/lib/uploads";

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

  if (!validName(name) || !validName(location) || (artist != null && typeof artist !== "string")) {
    return NextResponse.json(
      { error: "Thiếu thông tin bắt buộc." },
      { status: 400 },
    );
  }

  const times = parseShowTimes(startTime, endTime);
  const saleTimes = parseShowTimes(saleStart, saleEnd);
  if (!times) {
    return NextResponse.json(
      { error: "Sự kiện phải kết thúc sau khi bắt đầu." },
      { status: 400 },
    );
  }

  if (!saleTimes || saleTimes.start > times.start) {
    return NextResponse.json({ error: "Lịch mở bán không hợp lệ: kết thúc phải sau bắt đầu, và mở bán không được sau đêm diễn đầu tiên." }, { status: 400 });
  }

  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "Ảnh quảng bá không hợp lệ." },
      { status: 400 },
    );
  }

  const genres =
    genreSlugs === undefined ? undefined : await checkGenreSlugs(genreSlugs);
  if (genres === null) {
    return NextResponse.json(
      { error: "Vui lòng chọn thể loại từ danh sách." },
      { status: 400 },
    );
  }

  const province = typeof provinceCode === "number" && Number.isInteger(provinceCode)
    ? await prisma.province.findUnique({ where: { code: provinceCode } })
    : null;
  if (!province) {
    return NextResponse.json(
      { error: "Vui lòng chọn tỉnh/thành từ danh sách." },
      { status: 400 },
    );
  }

  const event = await prisma.event.create({
    data: {
      name: name.trim(),
      artist: typeof artist === "string" ? artist.trim() || null : null,
      imageUrl: imageUrl || null,
      genres: { connect: (genres ?? []).map((slug) => ({ slug })) },
      location: location.trim(),
      provinceCode: province.code,
      startTime: times.start,
      endTime: times.end,
      saleStart: saleTimes.start,
      saleEnd: saleTimes.end,
      // the first night; more can be added from the "Đêm diễn" tab
      shows: {
        create: {
          name: "Đêm 1",
          startTime: times.start,
          endTime: times.end,
        },
      },
    },
  });

  return NextResponse.json(event, { status: 201 });
}
