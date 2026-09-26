import { notFound } from "next/navigation";
import { getEvent, getEvents } from "@/lib/data";
import EventWorkspace from "@/components/EventWorkspace";
import { getProvinces } from "@/lib/provinces";
import { getGenres } from "@/lib/genres";

// static export: one editor page per event in the snapshot
export const dynamicParams = false;
export function generateStaticParams() {
  return getEvents().map((e) => ({ id: e.id }));
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = getEvent(id);

  if (!event) notFound();

  const [provinces, genres] = await Promise.all([getProvinces(), getGenres()]);

  return (
    <EventWorkspace
      provinces={provinces}
      genres={genres}
      event={{
        id: event.id,
        name: event.name,
        artist: event.artist,
        imageUrl: event.imageUrl,
        genreSlugs: event.genres.map((g) => g.slug),
        location: event.location,
        provinceCode: event.provinceCode,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        saleStart: event.saleStart.toISOString(),
        saleEnd: event.saleEnd.toISOString(),
      }}
      zones={event.zones.map((z) => ({
        id: z.id,
        name: z.name,
        prices: z.prices,
        quotas: z.quotas.map((q) => ({
          showId: q.showId,
          capacity: q.capacity,
        })),
      }))}
      shows={event.shows.map((s) => ({
        id: s.id,
        name: s.name,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
      }))}
      phases={event.phases.map((p) => ({
        id: p.id,
        name: p.name,
        startTime: p.startTime.toISOString(),
        endTime: p.endTime.toISOString(),
      }))}
    />
  );
}
