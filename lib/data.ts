// Static demo: every page reads this frozen copy of the database instead of Prisma.
// Regenerate it with `node scripts/export-snapshot.mjs` on a machine with the real data.
import snapshot from "@/data/snapshot.json";

type Iso = string;

type RawShow = { id: string; name: string; startTime: Iso; endTime: Iso };
type RawPhase = RawShow;
type RawPrice = {
  id: string;
  zoneId: string;
  phaseId: string;
  floorPrice: number;
  basePrice: number;
  ceilingPrice: number;
};
type RawZone = {
  id: string;
  name: string;
  createdAt: Iso;
  prices: RawPrice[];
  quotas: { showId: string; capacity: number }[];
};
type RawEvent = {
  id: string;
  name: string;
  artist: string | null;
  imageUrl: string | null;
  location: string;
  provinceCode: number | null;
  startTime: Iso;
  endTime: Iso;
  saleStart: Iso;
  saleEnd: Iso;
  province: { code: number; name: string; fullName: string } | null;
  genres: { slug: string }[];
  zones: RawZone[];
  phases: RawPhase[];
  shows: RawShow[];
};

// the JSON keeps dates as strings; pages expect Date objects like Prisma returns
const withDates = <T extends { startTime: Iso; endTime: Iso }>(r: T) => ({
  ...r,
  startTime: new Date(r.startTime),
  endTime: new Date(r.endTime),
});

function revive(ev: RawEvent) {
  return {
    ...ev,
    startTime: new Date(ev.startTime),
    endTime: new Date(ev.endTime),
    saleStart: new Date(ev.saleStart),
    saleEnd: new Date(ev.saleEnd),
    zones: ev.zones.map((z) => ({ ...z, createdAt: new Date(z.createdAt) })),
    phases: ev.phases.map(withDates),
    shows: ev.shows.map(withDates),
  };
}

export type SnapshotEvent = ReturnType<typeof revive>;

const events = (snapshot.events as RawEvent[]).map(revive);

/** every event, earliest first */
export function getEvents(): SnapshotEvent[] {
  return events;
}

export function getEvent(id: string): SnapshotEvent | undefined {
  return events.find((e) => e.id === id);
}

/** sorted alphabetically (Vietnamese) at export time */
export function getProvinces(): { code: number; name: string }[] {
  return snapshot.provinces;
}

export function getGenres(): { slug: string; name: string; featured: boolean }[] {
  return snapshot.genres;
}
