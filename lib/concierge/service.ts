import { prisma } from "@/lib/prisma";
import { placeLabel } from "@/lib/provinces";
import { publicShowPrices } from "@/lib/pricing-copilot/public-show-prices";
import type { Night, Watch } from "./types";

export async function nightsFor(buyerId?: string, now = new Date()): Promise<Night[]> {
  const paid = buyerId ? { buyerId, status: "PAID" } : undefined;
  const shows = await prisma.show.findMany({
    where: { OR: [{ startTime: { gt: now } }, ...(paid ? [{ orders: { some: paid } }] : [])] },
    orderBy: { startTime: "asc" },
    select: { id: true, name: true, startTime: true, endTime: true, eventId: true,
      event: { select: { name: true, location: true, province: { select: { name: true } } } },
      quotas: { where: { capacity: { gt: 0 } }, select: { zone: { select: { id: true, name: true } } } },
      orders: { where: paid ?? { id: { in: [] } }, select: { id: true }, take: 1 },
      feedback: { where: buyerId ? { buyerId } : { id: { in: [] } }, select: { rating: true, comment: true }, take: 1 },
    },
  });
  return shows.map(s => ({
    id: s.id, eventId: s.eventId, title: s.event.name, name: s.name, location: placeLabel(s.event.location, s.event.province),
    start: s.startTime.toISOString(), end: s.endTime.toISOString(), booked: s.orders.length > 0,
    zones: s.quotas.map(q => q.zone), feedback: s.feedback[0] ?? null,
  }));
}

export async function savePriceWatch(buyerId: string, showId: string, zoneId: string, target: number) {
  const quota = await prisma.zoneQuota.findFirst({
    where: { showId, zoneId, capacity: { gt: 0 }, show: { startTime: { gt: new Date() } } },
    select: { zone: { select: { name: true } }, show: { select: { name: true, event: { select: { name: true } } } } },
  });
  if (!quota) return null;
  const key = { buyerId, showId, zoneId };
  // Replaying a request keeps its notification. Changing the threshold starts a new check.
  await prisma.$transaction([
    prisma.priceWatch.upsert({ where: { buyerId_showId_zoneId: key }, create: { ...key, target }, update: { buyerId } }),
    prisma.priceWatch.updateMany({ where: { ...key, target: { not: target } }, data: { target, matchedAt: null, matchedPrice: null, readAt: null } }),
  ]);
  return quota;
}

// The scheduled check and a buyer opening the site use the same one-shot, atomic threshold match.
export async function checkWatches(scope: { buyerId?: string; showId?: string }, now = new Date()) {
  const where = { ...scope, matchedAt: null, show: { startTime: { gt: now } } };
  const shows = await prisma.priceWatch.findMany({ where, distinct: ["showId"], select: { showId: true } });
  for (const { showId } of shows) {
    const view = await publicShowPrices(showId, now);
    if (!view?.onSale) continue;
    for (const zone of view.zones) {
      if (zone.seatsLeft <= 0) continue;
      await prisma.priceWatch.updateMany({
        where: { ...where, showId, zoneId: zone.zoneId, target: { gte: zone.currentPrice } },
        data: { matchedPrice: zone.currentPrice, matchedAt: now, readAt: null },
      });
    }
  }
}

export async function watchesFor(buyerId: string): Promise<Watch[]> {
  const rows = await prisma.priceWatch.findMany({
    where: { buyerId }, orderBy: { id: "desc" },
    include: { zone: { select: { name: true } }, show: { select: { name: true, startTime: true, eventId: true, event: { select: { name: true } } } } },
  });
  return rows.map(w => ({ id: w.id, eventId: w.show.eventId, showId: w.showId, title: w.show.event.name,
    night: w.show.name, start: w.show.startTime.toISOString(), zone: w.zone.name, target: w.target, matchedPrice: w.matchedPrice,
    matchedAt: w.matchedAt?.toISOString() ?? null, read: !!w.readAt }));
}
