import { prisma } from "@/lib/prisma";

/** tên mọi nghệ sĩ, để gợi ý khi ban tổ chức nhập */
export async function getArtistNames(): Promise<string[]> {
  const rows = await prisma.artist.findMany({ select: { name: true } });
  return rows.map((a) => a.name).sort((a, b) => a.localeCompare(b, "vi"));
}
