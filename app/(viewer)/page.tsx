import { Suspense } from "react";
import { getEvents } from "@/lib/data";
import { getProvinces } from "@/lib/provinces";
import { getGenres } from "@/lib/genres";
import HomeView, { HomeFromUrl, type HeroTile } from "@/components/HomeView";

// hand-picked hero tiles: t1–t3 sit left of the search bar, t4–t6 right.
// matched by name prefix; a slot whose event is gone takes the next upcoming one
const HERO_PICKS: [slot: string, namePrefix: string][] = [
  ["t1", "BIGBANG"],
  ["t2", "Tinh Hà"],
  ["t3", "Vietnam Airlines Classic"],
  ["t4", "Tiffany Young"],
  ["t5", "Anh Trai Vượt Ngàn Chông Gai"],
  ["t6", "Phùng Khánh Linh"],
];

export default async function HomePage() {
  const events = getEvents();
  const picked = HERO_PICKS.map(([slot, prefix]) => ({
    slot,
    ev: events.find((e) => e.name.startsWith(prefix)),
  }));
  // one tile per event, so none repeats
  const spare = events.filter((e) => !picked.some((p) => p.ev?.id === e.id));
  const artTiles = picked
    .map(({ slot, ev }) => ({ slot, ev: ev ?? spare.shift() }))
    .filter((t): t is HeroTile & { ev: (typeof events)[number] } => !!t.ev)
    .map(({ slot, ev }) => ({
      slot,
      ev: { id: ev.id, name: ev.name, imageUrl: ev.imageUrl },
    }));
  const [provinces, genres] = await Promise.all([getProvinces(), getGenres()]);

  const props = {
    events,
    artTiles,
    cities: provinces.map((p) => p.name),
    genreRows: genres,
  };
  // reading the URL only works in the browser, so static export needs it behind Suspense;
  // the fallback is the unfiltered page, which is what the prerendered HTML shows
  return (
    <Suspense fallback={<HomeView {...props} search="" />}>
      <HomeFromUrl {...props} />
    </Suspense>
  );
}
