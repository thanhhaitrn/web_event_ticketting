import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { saleSummary } from "@/lib/sales";
import { placeLabel } from "@/lib/provinces";
import { EVENT_TIME_ZONE } from "@/lib/browse";
import SeatPicker, { type PickerNight, type PickerZone } from "@/components/SeatPicker";

const nightFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: EVENT_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SeatsPage({
  params,
  searchParams,
}: PageProps<"/events/[id]/seats">) {
  const { id } = await params;
  const { dem, khu } = await searchParams;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      province: true,
      zones: {
        orderBy: { createdAt: "asc" },
        include: { prices: true, quotas: true },
      },
      phases: true,
      shows: { orderBy: { startTime: "asc" } },
    },
  });
  if (!event) notFound();

  const now = new Date();
  const sale = saleSummary(event.phases, now);
  const nights = event.shows.filter((s) => s.endTime > now);
  const night = nights.find((s) => s.id === dem) ?? nights[0];

  const zones: PickerZone[] =
    sale.isSelling && night
      ? event.zones.flatMap((z) => {
          const price = z.prices.find((p) => p.phaseId === sale.phase.id);
          const capacity = z.quotas.find((q) => q.showId === night.id)?.capacity ?? 0;
          return price && capacity > 0
            ? [{ id: z.id, name: z.name, capacity, price: price.basePrice, color: z.color }]
            : [];
        })
      : [];

  if (zones.length === 0 || !night) {
    return (
      <main className="page narrow">
        <Link href={`/events/${event.id}`} className="back-link">
          ← Quay lại thông tin sự kiện
        </Link>
        <h1 className="seat-title">{event.name}</h1>
        <div className="empty-state">Sự kiện này hiện chưa mở bán vé.</div>
      </main>
    );
  }

  const toNight = (s: { id: string; name: string; startTime: Date }): PickerNight => ({
    id: s.id,
    name: s.name,
    when: `${s.name} · ${nightFmt.format(s.startTime)}`,
  });

  return (
    <SeatPicker
      key={night.id}
      eventId={event.id}
      eventName={event.name}
      imageUrl={event.imageUrl}
      venueName={placeLabel(event.location, event.province)}
      seatMapUrl={event.seatMapUrl}
      venuePlan={event.venuePlan}
      night={toNight(night)}
      nights={nights.map(toNight)}
      zones={zones}
      initialZoneId={typeof khu === "string" && zones.some((z) => z.id === khu) ? khu : null}
    />
  );
}
