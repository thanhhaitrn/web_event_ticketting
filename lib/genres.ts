import { prisma } from "@/lib/prisma";

export type GenreOption = { slug: string; name: string; featured: boolean };

export function getGenres(): Promise<GenreOption[]> {
  return prisma.genre.findMany({
    select: { slug: true, name: true, featured: true },
    orderBy: { sortOrder: "asc" },
  });
}
