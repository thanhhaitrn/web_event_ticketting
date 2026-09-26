import { readFileSync } from "node:fs";
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { existsSync } from "node:fs";

const { PrismaClient } = pkg;

// upserts, so it is safe to re-run and never touches event data
export async function seedGenres(prisma) {
  const { genres } = JSON.parse(readFileSync(new URL("./data/genres.json", import.meta.url), "utf8"));
  for (const { slug, name, mbid, featured, sortOrder } of genres) {
    await prisma.genre.upsert({
      where: { slug },
      update: { name, mbid, featured, sortOrder },
      create: { slug, name, mbid, featured, sortOrder },
    });
  }
  return genres.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
  console.log(`Seeded ${await seedGenres(prisma)} genres`);
  await prisma.$disconnect();
}
