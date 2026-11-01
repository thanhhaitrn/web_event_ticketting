// A venue drawing is a list of clickable sections, each covering a range of a zone's seats.
// Events with a hand-drawn plan (lib/venue-plans.ts) use it; any other event gets rings of
// sections around the stage, generated from its ticket tiers.
import { SEATS_PER_ROW, blockCount, blockRange, rowName } from "@/lib/seat-layout";
import { PLANS } from "@/lib/venue-plans";

export type VenueZone = {
  id: string;
  name: string;
  capacity: number;
  price: number;
  color: string | null;
};

export type Section = {
  key: string;
  /** what is printed on the section */
  label: string;
  /** what the seat page calls it */
  title: string;
  zoneId: string;
  zoneName: string;
  color: string;
  first: number;
  last: number;
  points: string;
  x: number;
  y: number;
  /** turns the label to read along tall, narrow sections */
  rotate: number;
  fontSize: number;
};

export type Decor = { points: string; fill: string; label?: string; x: number; y: number };

export type Venue = {
  sections: Section[];
  decor: Decor[];
  stage: { x: number; y: number; label: string; fontSize: number };
  /** the visible area of the drawing */
  box: { x: number; y: number; w: number; h: number };
  dark: boolean;
};

const DEFAULT_COLOR = "#8fa3e8";
const round = (n: number) => Math.round(n * 10) / 10;

/** centre of a polygon's corners, good enough to place its label */
function centre(points: [number, number][]) {
  return [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
}
const toPoints = (points: [number, number][]) =>
  points.map((p) => `${round(p[0])},${round(p[1])}`).join(" ");

function fromPlan(planKey: string, zones: VenueZone[]): Venue | null {
  const plan = PLANS[planKey];
  if (!plan) return null;
  const sections: Section[] = [];
  for (const zone of zones) {
    const shapes = plan.sections.filter((s) => s.zone === zone.name);
    if (shapes.length === 0) continue;
    // the map prints some names on several blocks; tickets have to tell them apart
    const printed = new Map<string, number>();
    for (const shape of shapes) printed.set(shape.label, (printed.get(shape.label) ?? 0) + 1);
    const seen = new Map<string, number>();
    // whole rows per section, so seat rows never break across two sections
    const share = Math.max(20, Math.floor(zone.capacity / shapes.length / 20) * 20);
    shapes.forEach((shape, i) => {
      const first = i * share + 1;
      const last = i === shapes.length - 1 ? zone.capacity : Math.min(zone.capacity, (i + 1) * share);
      if (first > last) return;
      const [x, y] = centre(shape.points);
      const nth = (seen.get(shape.label) ?? 0) + 1;
      seen.set(shape.label, nth);
      sections.push({
        key: `${zone.id}:${i}`,
        label: shape.label,
        title: (printed.get(shape.label) ?? 1) > 1 ? `${shape.label} · Khối ${nth}` : shape.label,
        zoneId: zone.id,
        zoneName: zone.name,
        color: zone.color ?? DEFAULT_COLOR,
        first,
        last,
        points: toPoints(shape.points),
        x: round(x),
        y: round(y),
        rotate: shape.rotate ?? 0,
        fontSize: shape.fontSize ?? 11,
      });
    });
  }
  return {
    sections,
    decor: plan.decor.map((d) => {
      const [x, y] = centre(d.points);
      return { points: toPoints(d.points), fill: d.fill, label: d.label, x: round(x), y: round(y) };
    }),
    stage: plan.stage,
    box: plan.box,
    dark: true,
  };
}

// ───── generated rings ─────

const STRETCH = 1.22; // arenas are wider than deep
const FIRST_RING = 92;
const OUTER = 460;

const at = (r: number, t: number): [number, number] => [
  r * STRETCH * Math.sin(t),
  -r * Math.cos(t),
];

function generated(zones: VenueZone[]): Venue {
  const blocks = [...zones]
    .sort((a, b) => b.price - a.price)
    .flatMap((zone) =>
      Array.from({ length: blockCount(zone.capacity) }, (_, block) => ({ zone, block })),
    );

  // section depth chosen so the rings fill the arena, and sections stay roughly square
  const area = Math.PI * (OUTER ** 2 - FIRST_RING ** 2) * 0.9;
  const depth = Math.min(120, Math.max(22, Math.sqrt(area / Math.max(1, blocks.length))));

  const sections: Section[] = [];
  let ring = FIRST_RING;
  let next = 0;
  while (next < blocks.length) {
    const r0 = ring;
    const r1 = ring + depth * 0.94;
    const slots = Math.max(4, Math.floor((2 * Math.PI * (r0 + r1)) / 2 / depth));
    const step = (2 * Math.PI) / slots;
    // fill outward from the top in both directions, which keeps every tier symmetrical
    for (let i = 0; i < slots && next < blocks.length; i++, next++) {
      const side = i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2;
      const middle = side * step;
      const t0 = middle - step * 0.46;
      const t1 = middle + step * 0.46;
      const { zone, block } = blocks[next];
      const [first, last] = blockRange(block, zone.capacity);
      const inner = Array.from({ length: 7 }, (_, k) => at(r0, t0 + ((t1 - t0) * k) / 6));
      const outer = Array.from({ length: 7 }, (_, k) => at(r1, t1 - ((t1 - t0) * k) / 6));
      const [x, y] = at((r0 + r1) / 2, middle);
      sections.push({
        key: `${zone.id}:${block}`,
        label: String(next + 1),
        title: `Khu ${next + 1}`,
        zoneId: zone.id,
        zoneName: zone.name,
        color: zone.color ?? DEFAULT_COLOR,
        first,
        last,
        points: toPoints([...inner, ...outer]),
        x: round(x),
        y: round(y),
        rotate: 0,
        fontSize: Math.min(16, depth * 0.3),
      });
    }
    ring = r0 + depth;
  }

  const reach = Math.max(ring, FIRST_RING + 40) + 16;
  return {
    sections,
    decor: [],
    stage: { x: 0, y: 0, label: "SÂN KHẤU", fontSize: 18 },
    box: { x: -reach * STRETCH, y: -reach, w: reach * STRETCH * 2, h: reach * 2 },
    dark: false,
  };
}

export function buildVenue(zones: VenueZone[], planKey: string | null): Venue {
  return (planKey && fromPlan(planKey, zones)) || generated(zones);
}

/** whether every seat of a section is taken, from the per-row counts of the availability API */
export function sectionFull(section: Section, taken: Record<string, number>): boolean {
  let total = 0;
  const lastRow = Math.floor((section.last - 1) / SEATS_PER_ROW);
  for (let row = Math.floor((section.first - 1) / SEATS_PER_ROW); row <= lastRow; row++) {
    total += taken[`${section.zoneId}:${row}`] ?? 0;
  }
  return total >= section.last - section.first + 1;
}

// ───── seats inside a section ─────

export type SeatLayout = {
  seats: { n: number; points: string; x: number; y: number; col: number; label: string }[];
  rows: { name: string; x: number; y: number }[];
  /** the side of one seat, in map units */
  size: number;
};

type Pt = [number, number];
const fine = (n: number) => Math.round(n * 100) / 100;
const finePoints = (points: Pt[]) => points.map((p) => `${fine(p[0])},${fine(p[1])}`).join(" ");
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const seatLabelAt = (row: number, col: number) => `${rowName(row)}-${String(col).padStart(2, "0")}`;

/** a four-cornered section: rows and columns follow its edges, so seats lean with the stand */
function inQuad(corners: Pt[], first: number, count: number): SeatLayout {
  // mirrored sections list their corners right to left; seat 1 always reads from the left
  const [a, b, c, d] =
    corners[0][0] > corners[1][0]
      ? [corners[1], corners[0], corners[3], corners[2]]
      : corners;
  const wide = (dist(a, b) + dist(d, c)) / 2;
  const tall = (dist(a, d) + dist(b, c)) / 2;
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * wide) / tall)));
  const rowCount = Math.ceil(count / cols);
  const margin = 0.025;
  // one extra column holds the row letters
  const du = (1 - 2 * margin) / (cols + 1);
  const dv = (1 - 2 * margin) / rowCount;
  const at = (u: number, v: number): Pt => {
    const top: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const bottom: Pt = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
    return [top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v];
  };

  const seats: SeatLayout["seats"] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const u = margin + du * (col + 1);
    const v = margin + dv * row;
    const [x, y] = at(u + du / 2, v + dv / 2);
    seats.push({
      n: first + i,
      points: finePoints([
        at(u + du * 0.12, v + dv * 0.12),
        at(u + du * 0.88, v + dv * 0.12),
        at(u + du * 0.88, v + dv * 0.88),
        at(u + du * 0.12, v + dv * 0.88),
      ]),
      x: fine(x),
      y: fine(y),
      col: col + 1,
      label: seatLabelAt(row, col + 1),
    });
  }
  const rows = Array.from({ length: rowCount }, (_, row) => {
    const [x, y] = at(margin + du / 2, margin + dv * (row + 0.5));
    return { name: rowName(row), x: fine(x), y: fine(y) };
  });
  return { seats, rows, size: Math.min(du * wide, dv * tall) };
}

function contains(polygon: Pt[], [x, y]: Pt) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** any other shape: a level grid, keeping the cells that lie wholly inside */
function inShape(polygon: Pt[], first: number, count: number): SeatLayout {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const area = Math.abs(
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;

  for (let size = Math.sqrt(area / count); ; size *= 0.97) {
    const seats: SeatLayout["seats"] = [];
    const rows: SeatLayout["rows"] = [];
    for (let y = Math.min(...ys); y + size <= Math.max(...ys) && seats.length < count; y += size) {
      let col = 0;
      for (let x = Math.min(...xs); x + size <= Math.max(...xs) && seats.length < count; x += size) {
        const cell: Pt[] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
        if (!cell.every((p) => contains(polygon, p))) continue;
        // the first cell of a row holds its letter
        if (col === 0) rows.push({ name: rowName(rows.length), x: fine(x + size / 2), y: fine(y + size / 2) });
        else {
          const inset = size * 0.12;
          seats.push({
            n: first + seats.length,
            points: finePoints([
              [x + inset, y + inset],
              [x + size - inset, y + inset],
              [x + size - inset, y + size - inset],
              [x + inset, y + size - inset],
            ]),
            x: fine(x + size / 2),
            y: fine(y + size / 2),
            col,
            label: seatLabelAt(rows.length - 1, col),
          });
        }
        col++;
      }
    }
    if (seats.length >= count) return { seats, rows, size };
  }
}

const layouts = new WeakMap<Section, SeatLayout>();

/** where each seat of a section sits inside its shape */
export function seatsOf(section: Section): SeatLayout {
  let layout = layouts.get(section);
  if (!layout) {
    const points = section.points.split(" ").map((p) => p.split(",").map(Number) as Pt);
    const count = section.last - section.first + 1;
    layout =
      points.length === 4
        ? inQuad(points, section.first, count)
        : inShape(points, section.first, count);
    layouts.set(section, layout);
  }
  return layout;
}

/** what a buyer reads for a seat: its section, then row and number within that section */
export function seatName(venue: Venue, zoneId: string, seat: number): string {
  const section = venue.sections.find((s) => s.zoneId === zoneId && s.first <= seat && seat <= s.last);
  return section ? `${section.title} · ${seatsOf(section).seats[seat - section.first].label}` : `Ghế ${seat}`;
}
