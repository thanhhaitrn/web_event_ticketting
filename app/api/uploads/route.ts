import { NextRequest, NextResponse } from "next/server";
import { MAX_IMAGE_BYTES, saveImage, sniffImage } from "@/lib/uploads";

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

  const url = await saveImage(buf, ext).catch((e) => {
    console.error("image upload failed", e);
    return null;
  });
  if (!url) {
    return NextResponse.json(
      { error: "Không lưu được ảnh, vui lòng thử lại." },
      { status: 502 },
    );
  }
  return NextResponse.json({ url }, { status: 201 });
}
