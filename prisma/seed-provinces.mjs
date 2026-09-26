import { readFileSync } from "node:fs";
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { existsSync } from "node:fs";

const { PrismaClient } = pkg;

// upserts, so it is safe to re-run and never touches event data
export async function seedProvinces(prisma) {
  const { provinces } = JSON.parse(readFileSync(new URL("./data/provinces.json", import.meta.url), "utf8"));
  for (const p of provinces) {
    await prisma.province.upsert({
      where: { code: p.code },
      update: { name: p.name, fullName: p.fullName },
      create: p,
    });
  }
  return provinces.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
  const n = await seedProvinces(prisma);
  console.log(`Seeded ${n} provinces`);
  await prisma.$disconnect();
}
