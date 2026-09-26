import { prisma } from "@/lib/prisma";

// SQLite can't collate Vietnamese, so the alphabetical sort happens here
export async function getProvinces() {
  const rows = await prisma.province.findMany({ select: { code: true, name: true } });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function placeLabel(venue: string, province?: { name: string } | null) {
  return [venue, province?.name].filter(Boolean).join(", ");
}
