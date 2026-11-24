/**
 * [PHẦN 01 — DYNAMIC PRICING v1.1]  Repository trong bộ nhớ — dùng cho unit/integration test
 * (không cần CSDL). Hành vi khoá duy nhất giống bảng PriceChange thật.
 */
import type {
  PriceChangeRecord,
  PricingRepository,
  SeatCounts,
  ShowContext,
} from "./pricing-service";
import type { Money } from "./types";

export class InMemoryPricingRepository implements PricingRepository {
  readonly changes: PriceChangeRecord[] = [];
  readonly shows = new Map<string, ShowContext>();
  readonly seats = new Map<string, Map<string, SeatCounts>>(); // showId → zoneId → counts

  addShow(ctx: ShowContext) {
    this.shows.set(ctx.showId, ctx);
  }

  setSeats(showId: string, zoneId: string, counts: SeatCounts) {
    if (!this.seats.has(showId)) this.seats.set(showId, new Map());
    this.seats.get(showId)!.set(zoneId, counts);
  }

  async loadShowContext(showId: string) {
    return this.shows.get(showId) ?? null;
  }

  async countSeats(showId: string) {
    return new Map(this.seats.get(showId) ?? []);
  }

  async priceAt(zoneId: string, showId: string, phaseId: string, at: Date, since?: Date): Promise<Money | null> {
    let best: PriceChangeRecord | null = null;
    for (const c of this.changes) {
      if (c.zoneId !== zoneId || c.showId !== showId || c.phaseId !== phaseId) continue;
      if (c.createdAt.getTime() > at.getTime()) continue;
      if (since && c.createdAt.getTime() < since.getTime()) continue;
      if (!best || c.createdAt.getTime() >= best.createdAt.getTime()) best = c;
    }
    return best ? best.newPrice : null;
  }

  async insertPriceChange(rec: PriceChangeRecord) {
    const dup = this.changes.some(
      (c) =>
        c.zoneId === rec.zoneId &&
        c.showId === rec.showId &&
        c.phaseId === rec.phaseId &&
        c.cycle === rec.cycle,
    );
    if (dup) return false;
    this.changes.push(rec);
    return true;
  }

  async listShowsWithActivePhase(now: Date) {
    const t = now.getTime();
    return [...this.shows.values()]
      .filter((s) => s.phases.some((p) => p.start.getTime() <= t && t < p.end.getTime()))
      .map((s) => s.showId);
  }
}
