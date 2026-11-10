import { NextRequest, NextResponse } from "next/server";
import { CONTENT_TYPES, UPLOAD_NAME, readImage } from "@/lib/uploads";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { name } = await ctx.params;
  const match = UPLOAD_NAME.exec(name);
  if (!match) return new NextResponse(null, { status: 404 });

  const data = await readImage(name);
  if (!data) return new NextResponse(null, { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": CONTENT_TYPES[match[1]],
      // names are random and never reused, so the file behind a URL never changes
      // s-maxage lets the host's CDN keep it too, so each image is fetched from storage once
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
