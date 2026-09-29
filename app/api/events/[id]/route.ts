import { validBody, validName } from "@/lib/validation";
import { parseShowTimes } from "@/lib/shows";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ImageRef, Venue } from "@/lib/domain";
import { eventRepository, findGenres, findProvince } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { isValidImageUrl, UPLOAD_DIR, UPLOAD_URL } from "@/lib/uploads";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      zones: {
        orderBy: { createdAt: "asc" },
        include: { prices: true, quotas: true },
      },
      phases: { orderBy: { startTime: "asc" } },
      shows: { orderBy: { startTime: "asc" } },
    },
  });

  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy sự kiện." },
      { status: 404 },
    );
  }

  return NextResponse.json(event);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
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
    saleStart,
    saleEnd,
  } = body;
  // startTime/endTime are not editable here: they follow the event's nights

  const event = await eventRepository.findById(id);
  if (!event) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  if ((name !== undefined && !validName(name)) || (location !== undefined && !validName(location)) || (artist != null && typeof artist !== "string")) {
    return NextResponse.json({ error: "Tên, nghệ sĩ hoặc địa điểm không hợp lệ." }, { status: 400 });
  }
  const current = event.getSaleWindow();
  const saleTimes = parseShowTimes(
    saleStart === undefined ? current.start.toISOString() : saleStart,
    saleEnd === undefined ? current.end.toISOString() : saleEnd,
  );
  if (!saleTimes) {
    return NextResponse.json({ error: "Lịch mở bán không hợp lệ: kết thúc phải sau bắt đầu, và mở bán không được sau đêm diễn đầu tiên." }, { status: 400 });
  }

  if (imageUrl !== undefined && !isValidImageUrl(imageUrl)) {
    return NextResponse.json(
      { error: "Ảnh quảng bá không hợp lệ." },
      { status: 400 },
    );
  }

  const genres = genreSlugs === undefined ? undefined : await findGenres(genreSlugs);
  if (genres === null) {
    return NextResponse.json(
      { error: "Vui lòng chọn thể loại từ danh sách." },
      { status: 400 },
    );
  }

  const province = provinceCode === undefined ? undefined : await findProvince(provinceCode);
  if (province === null) {
    return NextResponse.json(
      { error: "Vui lòng chọn tỉnh/thành từ danh sách." },
      { status: 400 },
    );
  }

  try {
    if (typeof name === "string") event.rename(name);
    if (artist !== undefined) event.setArtist(typeof artist === "string" ? artist : undefined);
    if (location !== undefined || province !== undefined) {
      const venue = event.getVenue();
      event.relocate(
        new Venue(typeof location === "string" ? location.trim() : venue.getLocation(), province ?? venue.getProvince()),
      );
    }
    if (imageUrl !== undefined) event.setImage(imageUrl ? ImageRef.parse(imageUrl) : undefined);
    if (genres !== undefined) event.setGenres(genres);
    if (saleStart !== undefined || saleEnd !== undefined) event.reopenSales(saleTimes);
  } catch (e) {
    return domainErrorResponse(e);
  }
  await eventRepository.save(event);

  const saved = await prisma.event.findUnique({ where: { id } });
  return NextResponse.json(saved);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await eventRepository.findById(id);
  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy sự kiện." },
      { status: 404 },
    );
  }

  const imageUrl = event.getImage()?.getUrl();
  await eventRepository.delete(event);

  // drop the uploaded image too, unless another event still points at it
  if (imageUrl && UPLOAD_URL.test(imageUrl) && !(await eventRepository.isImageUsed(imageUrl))) {
    const name = imageUrl.split("/").pop()!;
    await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
