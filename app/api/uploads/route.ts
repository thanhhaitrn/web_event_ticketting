import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGE_BYTES, UPLOAD_DIR, sniffImage } from "@/lib/uploads";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Không tìm thấy tệp ảnh." },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Ảnh vượt quá 5 MB." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniffImage(buf);
  if (!ext) {
    return NextResponse.json(
      { error: "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP." },
      { status: 415 },
    );
  }

  const name = `${randomUUID()}.${ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return NextResponse.json({ url: `/api/uploads/${name}` }, { status: 201 });
}
