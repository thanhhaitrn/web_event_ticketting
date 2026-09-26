import { getGenres as snapshotGenres } from "@/lib/data";

export type GenreOption = { slug: string; name: string; featured: boolean };

// static demo: genres come from the snapshot, in their sort order
export async function getGenres(): Promise<GenreOption[]> {
  return snapshotGenres();
}
