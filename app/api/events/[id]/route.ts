import { validBody, validName } from "@/lib/validation";
import { parseShowTimes } from "@/lib/shows";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkGenreSlugs } from "@/lib/genres";
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

  const current = await prisma.event.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Không tìm thấy sự kiện." }, { status: 404 });
  }
  if ((name !== undefined && !validName(name)) || (location !== undefined && !validName(location)) || (artist != null && typeof artist !== "string")) {
    return NextResponse.json({ error: "Tên, nghệ sĩ hoặc địa điểm không hợp lệ." }, { status: 400 });
  }
  const saleTimes = parseShowTimes(
    saleStart === undefined ? current.saleStart.toISOString() : saleStart,
    saleEnd === undefined ? current.saleEnd.toISOString() : saleEnd,
  );
  if (!saleTimes || saleTimes.start > current.startTime) {
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

  if (provinceCode !== undefined) {
    const province = typeof provinceCode === "number" && Number.isInteger(provinceCode)
      ? await prisma.province.findUnique({ where: { code: provinceCode } })
      : null;
    if (!province) {
      return NextResponse.json(
        { error: "Vui lòng chọn tỉnh/thành từ danh sách." },
        { status: 400 },
      );
    }
  }

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(typeof name === "string" ? { name: name.trim() } : {}),
      ...(artist !== undefined ? { artist: typeof artist === "string" ? artist.trim() || null : null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
      ...(genres !== undefined
        ? { genres: { set: genres.map((slug) => ({ slug })) } }
        : {}),
      ...(typeof location === "string" ? { location: location.trim() } : {}),
      ...(typeof provinceCode === "number" ? { provinceCode } : {}),
      ...(saleStart !== undefined ? { saleStart: saleTimes.start } : {}),
      ...(saleEnd !== undefined ? { saleEnd: saleTimes.end } : {}),
    },
  });

  return NextResponse.json(event);
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { imageUrl: true },
  });
  if (!event) {
    return NextResponse.json(
      { error: "Không tìm thấy sự kiện." },
      { status: 404 },
    );
  }

  // zones, phases and prices go with it through the cascade rules in the schema
  await prisma.event.delete({ where: { id } });

  // drop the uploaded image too, unless another event still points at it
  if (event.imageUrl && UPLOAD_URL.test(event.imageUrl)) {
    const stillUsed = await prisma.event.count({
      where: { imageUrl: event.imageUrl },
    });
    if (stillUsed === 0) {
      const name = event.imageUrl.split("/").pop()!;
      await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
