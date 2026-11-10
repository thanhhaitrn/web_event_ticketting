import { readFileSync } from "node:fs";
import { createPrisma } from "./client.mjs";

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
  const prisma = createPrisma();
  const n = await seedProvinces(prisma);
  console.log(`Seeded ${n} provinces`);
  await prisma.$disconnect();
}
