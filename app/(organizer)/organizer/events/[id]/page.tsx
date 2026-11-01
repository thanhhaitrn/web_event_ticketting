import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EventWorkspace from "@/components/EventWorkspace";
import { getProvinces } from "@/lib/provinces";
import { getGenres } from "@/lib/genres";
import { getArtistNames } from "@/lib/artists";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      genres: { select: { slug: true } },
      artists: { select: { name: true }, orderBy: { createdAt: "asc" } },
      zones: {
        orderBy: { createdAt: "asc" },
        include: { prices: true, quotas: true },
      },
      phases: { orderBy: { startTime: "asc" } },
      shows: { orderBy: { startTime: "asc" } },
    },
  });

  if (!event) notFound();

  const [provinces, genres, artistNames] = await Promise.all([getProvinces(), getGenres(), getArtistNames()]);

  return (
    <EventWorkspace
      provinces={provinces}
      genres={genres}
      artistNames={artistNames}
      event={{
        id: event.id,
        name: event.name,
        artists: event.artists.map((a) => a.name),
        imageUrl: event.imageUrl,
        seatMapUrl: event.seatMapUrl,
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
