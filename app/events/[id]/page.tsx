import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import EventWorkspace from "@/components/EventWorkspace";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      zones: { orderBy: { createdAt: "asc" }, include: { prices: true } },
      phases: { orderBy: { startTime: "asc" } },
    },
  });

  if (!event) notFound();

  return (
    <EventWorkspace
      event={{
        id: event.id,
        name: event.name,
        location: event.location,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime.toISOString(),
        saleStart: event.saleStart.toISOString(),
        saleEnd: event.saleEnd.toISOString(),
      }}
      zones={event.zones.map((z) => ({
        id: z.id,
        name: z.name,
        capacity: z.capacity,
        prices: z.prices,
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
