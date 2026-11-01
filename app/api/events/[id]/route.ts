import { validBody, validName } from "@/lib/validation";
import { parseShowTimes } from "@/lib/shows";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ImageRef, Venue } from "@/lib/domain";
import { eventRepository, findGenres, findProvince, resolveArtists } from "@/lib/event-repository";
import { domainErrorResponse } from "@/lib/api-errors";
import { seatService } from "@/lib/seat-service";
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
    artists: artistNames,
    imageUrl,
    seatMapUrl,
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
  if ((name !== undefined && !validName(name)) || (location !== undefined && !validName(location))) {
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

  if ((imageUrl !== undefined && !isValidImageUrl(imageUrl)) || (seatMapUrl !== undefined && !isValidImageUrl(seatMapUrl))) {
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
    if (artistNames !== undefined) {
      const artists = await resolveArtists(artistNames);
      if (artists === null) {
        return NextResponse.json({ error: "Danh sách nghệ sĩ không hợp lệ." }, { status: 400 });
      }
      event.setArtists(artists);
    }
    if (location !== undefined || province !== undefined) {
      const venue = event.getVenue();
      event.relocate(
        new Venue(typeof location === "string" ? location.trim() : venue.getLocation(), province ?? venue.getProvince()),
      );
    }
    if (imageUrl !== undefined) event.setImage(imageUrl ? ImageRef.parse(imageUrl) : undefined);
    if (seatMapUrl !== undefined) event.setSeatMap(seatMapUrl ? ImageRef.parse(seatMapUrl) : undefined);
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

  if ((await seatService.countInUse({ eventId: id })) > 0) {
    return NextResponse.json({ error: "Sự kiện này đã có vé được giữ hoặc bán nên không thể xoá." }, { status: 409 });
  }

  const images = [event.getImage()?.getUrl(), event.getSeatMap()?.getUrl()];
  await eventRepository.delete(event);

  // drop the uploaded image too, unless another event still points at it
  for (const url of images) {
    if (url && UPLOAD_URL.test(url) && !(await eventRepository.isImageUsed(url))) {
      await unlink(path.join(UPLOAD_DIR, url.split("/").pop()!)).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
