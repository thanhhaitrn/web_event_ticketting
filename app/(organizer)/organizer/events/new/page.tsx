import EventWorkspace from "@/components/EventWorkspace";
import { getGenres } from "@/lib/genres";
import { getArtistNames } from "@/lib/artists";
import { getProvinces } from "@/lib/provinces";

export default async function NewEventPage() {
  const [provinces, genres, artistNames] = await Promise.all([getProvinces(), getGenres(), getArtistNames()]);
  return <EventWorkspace event={null} provinces={provinces} genres={genres} artistNames={artistNames} />;
}
