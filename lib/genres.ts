import { prisma } from "@/lib/prisma";

export type GenreOption = { slug: string; name: string; featured: boolean };

export function getGenres(): Promise<GenreOption[]> {
  return prisma.genre.findMany({
    select: { slug: true, name: true, featured: true },
    orderBy: { sortOrder: "asc" },
  });
}

// returns the de-duplicated slugs when every one exists in the genre table, otherwise null
export async function checkGenreSlugs(
  input: unknown,
): Promise<string[] | null> {
  if (!Array.isArray(input) || !input.every((s) => typeof s === "string"))
    return null;
  const slugs = [...new Set(input as string[])];
  if (slugs.length === 0) return [];
  const found = await prisma.genre.count({ where: { slug: { in: slugs } } });
  return found === slugs.length ? slugs : null;
}
