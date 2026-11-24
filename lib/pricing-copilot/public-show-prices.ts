import { prisma } from "@/lib/prisma";
import { listedTicketPrices } from "@/lib/listed-ticket-prices";
import { pricingRepository, pricingService, PricingService } from "@/lib/pricing";
import { buildPublicPriceView } from "@/lib/pricing-copilot/transparency";

export async function publicShowPrices(showId: string, now = new Date()) {
  const ctx = await pricingRepository.loadShowContext(showId);
  if (!ctx) return null;

  const idx = PricingService.activePhaseIndex(ctx.phases, now);
  if (idx < 0) return { showId, onSale: false, zones: [] };
  const phase = ctx.phases[idx];

  if (ctx.zones.length && ctx.zones.every(z => z.capacity === 0)) {
    const list = await prisma.salePhase.findUnique({
      where: { id: phase.id },
      select: {
        id: true, name: true,
        event: { select: {
          shows: { select: { id: true } },
          zones: { orderBy: { createdAt: "asc" }, select: {
            id: true, name: true, quotas: { select: { showId: true } },
            prices: { where: { phaseId: phase.id }, select: { phaseId: true, basePrice: true } },
          } },
        } },
      },
    });
    const listedPrices = list ? listedTicketPrices(list.event, list) : [];
    if (listedPrices.length) return { showId, phaseId: phase.id, onSale: false, zones: [], listedPrices };
  }

  if (ctx.zones.some((z) => z.prices[phase.id]?.dynamicEnabled)) {
    await pricingService.refreshIfDue(showId, now);
  }
  const counts = await pricingRepository.countSeats(showId, now);
  const changes = await prisma.priceChange.findMany({
    where: { showId, phaseId: phase.id },
    orderBy: { createdAt: "asc" },
    select: { zoneId: true, createdAt: true, newPrice: true },
  });

  const zones = ctx.zones
    .filter((z) => z.capacity > 0 && z.prices[phase.id])
    .map((z) => {
      const zp = z.prices[phase.id];
      const c = counts.get(z.zoneId) ?? { sold: 0, held: 0 };
      return buildPublicPriceView({
        zoneId: z.zoneId,
        base: zp.bounds.base,
        dynamic: zp.dynamicEnabled,
        bounds: zp.bounds,
        phaseStart: phase.start,
        now,
        capacity: z.capacity,
        sold: c.sold,
        held: c.held,
        changes: changes.filter((ch) => ch.zoneId === z.zoneId),
      });
    });

  return { showId, onSale: true, phaseId: phase.id, zones };
}
