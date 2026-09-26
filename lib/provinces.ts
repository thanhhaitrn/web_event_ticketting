import { getProvinces as snapshotProvinces } from "@/lib/data";

// static demo: provinces come from the snapshot, already sorted in Vietnamese order
export async function getProvinces() {
  return snapshotProvinces();
}

export function placeLabel(venue: string, province?: { name: string } | null) {
  return [venue, province?.name].filter(Boolean).join(", ");
}
