import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.zonePrice.deleteMany();
  await prisma.salePhase.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.event.deleteMany();

  const event = await prisma.event.create({
    data: {
      name: "Concert Mùa Hè Rực Rỡ 2026",
      location: "SVĐ Mỹ Đình, Hà Nội",
      startTime: new Date("2026-11-14T19:00:00+07:00"),
      endTime: new Date("2026-11-14T22:30:00+07:00"),
      saleStart: new Date("2026-09-20T09:00:00+07:00"),
      saleEnd: new Date("2026-11-13T23:59:00+07:00"),
    },
  });

  const zoneDefs = [
    { name: "VIP — Kim Cương", capacity: 450 },
    { name: "Hạng 1 — Vàng", capacity: 900 },
    { name: "Hạng 2 — Bạc", capacity: 1600 },
    { name: "Đứng — Sân khấu", capacity: 1000 },
  ];
  const zones = [];
  for (const z of zoneDefs) {
    zones.push(await prisma.zone.create({ data: { eventId: event.id, ...z } }));
  }

  const phase1 = await prisma.salePhase.create({
    data: {
      eventId: event.id,
      name: "Đợt 1 — Early Bird",
      startTime: new Date("2026-09-20T09:00:00+07:00"),
      endTime: new Date("2026-09-25T23:59:00+07:00"),
    },
  });
  const phase2 = await prisma.salePhase.create({
    data: {
      eventId: event.id,
      name: "Đợt 2 — Chính thức",
      startTime: new Date("2026-09-26T09:00:00+07:00"),
      endTime: new Date("2026-10-15T23:59:00+07:00"),
    },
  });

  const seedPrices = {
    "VIP — Kim Cương": { floorPrice: 2000000, basePrice: 2500000, ceilingPrice: 3200000 },
    "Hạng 1 — Vàng": { floorPrice: 1200000, basePrice: 1500000, ceilingPrice: 1900000 },
    "Hạng 2 — Bạc": { floorPrice: 700000, basePrice: 900000, ceilingPrice: 1150000 },
    "Đứng — Sân khấu": { floorPrice: 280000, basePrice: 350000, ceilingPrice: 450000 },
  };

  for (const zone of zones) {
    const p = seedPrices[zone.name];
    await prisma.zonePrice.create({
      data: { zoneId: zone.id, phaseId: phase1.id, ...p },
    });
  }

  console.log("Seeded event:", event.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
