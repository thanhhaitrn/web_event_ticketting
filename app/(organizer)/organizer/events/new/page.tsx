import EventWorkspace from "@/components/EventWorkspace";
import { getGenres } from "@/lib/genres";
import { getProvinces } from "@/lib/provinces";

export default async function NewEventPage() {
  const [provinces, genres] = await Promise.all([getProvinces(), getGenres()]);
  return <EventWorkspace event={null} provinces={provinces} genres={genres} />;
}
