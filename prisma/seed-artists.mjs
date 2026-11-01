// Tidies the artist table after the migration: gives each event a clean artist list
// and every artist a readable slug. Re-runnable.
//   node prisma/seed-artists.mjs
import { existsSync } from "node:fs";
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const { PrismaClient } = pkg;

// same as lib/slug.ts, which a plain Node script can't import
export const slugify = (text) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// event name prefix → artists, taken from the old free-text field
const LINEUPS = {
  "Vietnam Airlines Classic": ["London Symphony Orchestra", "Antonio Pappano"],
  "Chillies": ["Chillies"],
  "SAO Concert": ["SOOBIN", "Binz", "Rhymastic", "Quang Hùng MasterD", "Dương Domic", "RHYDER", "B Ray", "F.HERO"],
  "Tinh Hà": ["Tinh Hà Say Hi"],
  "Anh Trai Vượt Ngàn Chông Gai": ["Anh Trai Vượt Ngàn Chông Gai"],
  "Phùng Khánh Linh": ["Phùng Khánh Linh"],
  "Tiffany Young": ["Tiffany Young"],
  "BIGBANG": ["BIGBANG"],
  "Mr Siro": ["Mr Siro"],
  // the old text described the show, it named no artist
  "Liên Quân 10Fest": [],
  "Tùng Dương": ["Tùng Dương"],
};

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });

  // the migration's placeholder slugs become readable first, so the lookups below find these artists
  for (const a of await prisma.artist.findMany({ where: { slug: { startsWith: "artist-" } } })) {
    const slug = slugify(a.name);
    if (slug) await prisma.artist.update({ where: { id: a.id }, data: { slug } }).catch(() => {});
  }

  for (const [prefix, names] of Object.entries(LINEUPS)) {
    const event = await prisma.event.findFirst({ where: { name: { startsWith: prefix } } });
    if (!event) continue;
    const artists = [];
    for (const name of names) {
      const slug = slugify(name);
      artists.push(await prisma.artist.upsert({ where: { slug }, update: {}, create: { slug, name } }));
    }
    await prisma.event.update({
      where: { id: event.id },
      data: { artists: { set: artists.map((a) => ({ id: a.id })) } },
    });
  }

  // artists left without an event were only the old free-text values
  const { count } = await prisma.artist.deleteMany({ where: { events: { none: {} } } });

  console.log(`✓ ${await prisma.artist.count()} artists, ${count} old values removed`);
  await prisma.$disconnect();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
