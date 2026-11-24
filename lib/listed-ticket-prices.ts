type PriceListEvent = {
  shows: { id: string }[];
  zones: {
    id: string;
    name: string;
    quotas: { showId: string }[];
    prices: { phaseId: string; basePrice: number }[];
  }[];
};

// Event-wide prices can be attributed to one night before any seats are allocated.
export function listedTicketPrices(event: PriceListEvent, phase: { id: string; name: string } | null) {
  if (phase?.name !== "Giá niêm yết" || event.shows.length !== 1 || event.zones.some(z => z.quotas.length)) {
    return [];
  }
  return event.zones.flatMap(zone => {
    const price = zone.prices.find(p => p.phaseId === phase.id);
    return price ? [{ zoneId: zone.id, tier: zone.name, vnd: price.basePrice }] : [];
  });
}
