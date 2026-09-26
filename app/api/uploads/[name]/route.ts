import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { CONTENT_TYPES, UPLOAD_DIR, UPLOAD_NAME } from "@/lib/uploads";

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { name } = await ctx.params;
  const match = UPLOAD_NAME.exec(name);
  if (!match) return new NextResponse(null, { status: 404 });

  const data = await readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
  if (!data) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": CONTENT_TYPES[match[1]],
      // names are random and never reused, so the file behind a URL never changes
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
