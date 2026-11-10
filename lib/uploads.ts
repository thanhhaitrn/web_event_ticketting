import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// uuid + extension only, so a name can never climb out of UPLOAD_DIR
export const UPLOAD_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export const UPLOAD_URL = new RegExp(
  `^/api/uploads/${UPLOAD_NAME.source.slice(1, -1)}$`,
);

export const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// trust the bytes, not the browser-supplied MIME type
export function sniffImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpg";
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  return null;
}

// Deployed, images live in a private Vercel Blob store and this app serves them at
// /api/uploads/<name>, the same URLs as on a laptop, where they stay in UPLOAD_DIR.
const usesBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const blobPath = (name: string) => `uploads/${name}`;

/** true for null/empty (no image) or a URL this app issued */
export function isValidImageUrl(value: unknown): value is string | null {
  return (
    value === null ||
    value === "" ||
    (typeof value === "string" && UPLOAD_URL.test(value))
  );
}

/** stores a checked image and returns the URL to save on the event */
export async function saveImage(buf: Buffer, ext: string): Promise<string> {
  const name = `${randomUUID()}.${ext}`;
  if (usesBlob()) {
    await put(blobPath(name), buf, {
      access: "private",
      contentType: CONTENT_TYPES[ext],
    });
  } else {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, name), buf);
  }
  return `/api/uploads/${name}`;
}

/** the bytes behind /api/uploads/<name>, or null when there is no such image */
export async function readImage(
  name: string,
): Promise<ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> | null> {
  if (usesBlob()) {
    const blob = await get(blobPath(name), { access: "private" }).catch(
      () => null,
    );
    return blob?.stream ?? null;
  }
  const data = await readFile(path.join(UPLOAD_DIR, name)).catch(() => null);
  return data && new Uint8Array(data);
}

/** deletes an image this app stored; anything else is left alone */
export async function removeImage(url: string): Promise<void> {
  if (!UPLOAD_URL.test(url)) return;
  const name = url.split("/").pop()!;
  if (usesBlob()) await del(blobPath(name)).catch(() => {});
  else await unlink(path.join(UPLOAD_DIR, name)).catch(() => {});
}
