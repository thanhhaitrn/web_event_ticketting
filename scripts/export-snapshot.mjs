// Freezes the local database into data/snapshot.json for the static demo build,
// and copies every poster it references into public/uploads/.
// Run on a machine that has the real data:  node scripts/export-snapshot.mjs
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const { PrismaClient } = pkg;

if (existsSync(".env")) process.loadEnvFile(".env");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PUBLIC_UPLOADS = path.join(process.cwd(), "public", "uploads");

const events = await prisma.event.findMany({
  orderBy: { startTime: "asc" },
  include: {
    province: true,
    genres: { select: { slug: true }, orderBy: { sortOrder: "asc" } },
    zones: {
      orderBy: { createdAt: "asc" },
      include: {
        prices: { select: { zoneId: true, phaseId: true, floorPrice: true, basePrice: true, ceilingPrice: true, id: true } },
        quotas: { select: { showId: true, capacity: true } },
      },
    },
    phases: { orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true, endTime: true } },
    shows: { orderBy: { startTime: "asc" }, select: { id: true, name: true, startTime: true, endTime: true } },
  },
});
const provinces = await prisma.province.findMany({ select: { code: true, name: true } });
const genres = await prisma.genre.findMany({
  select: { slug: true, name: true, featured: true },
  orderBy: { sortOrder: "asc" },
});

// posters move from the upload API to plain static files
rmSync(PUBLIC_UPLOADS, { recursive: true, force: true });
mkdirSync(PUBLIC_UPLOADS, { recursive: true });
let copied = 0;
for (const ev of events) {
  if (!ev.imageUrl) continue;
  const name = ev.imageUrl.split("/").pop();
  const source = path.join(UPLOAD_DIR, name);
  if (!existsSync(source)) {
    console.warn(`! missing poster for "${ev.name}", showing the gradient tile instead`);
    ev.imageUrl = null;
    continue;
  }
  copyFileSync(source, path.join(PUBLIC_UPLOADS, name));
  ev.imageUrl = `/uploads/${name}`;
  copied++;
}

const snapshot = {
  exportedAt: new Date().toISOString(),
  events: events.map(({ createdAt, updatedAt, ...ev }) => ({
    ...ev,
    zones: ev.zones.map(({ updatedAt, eventId, ...z }) => z),
  })),
  provinces: provinces.sort((a, b) => a.name.localeCompare(b.name, "vi")),
  genres,
};
writeFileSync("data/snapshot.json", JSON.stringify(snapshot, null, 2) + "\n");
console.log(`✓ ${events.length} events, ${provinces.length} provinces, ${genres.length} genres, ${copied} posters`);
await prisma.$disconnect();
