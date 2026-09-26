// Real Vietnamese concerts, late 2026. Facts (dates, venues, lineups, published
// ticket tiers) come from press/ticketing sources; zone capacities, floor/ceiling
// prices, sale windows and unpublished show times are sensible placeholders.
// Re-runnable: each event is replaced by name, nothing else is touched.
import pkg from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { seedProvinces } from "./seed-provinces.mjs";
import { seedGenres } from "./seed-genres.mjs";

const { PrismaClient } = pkg;
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:./prisma/dev.db" }) });

const HANOI = 1;
const HCMC = 79;
const t = (s) => new Date(`${s}:00+07:00`);

// bounds for the future dynamic pricing: -15% floor, +30% ceiling, rounded to 10k
const round10k = (n) => Math.round(n / 10_000) * 10_000;
const bounds = (base) => ({ floorPrice: round10k(base * 0.85), basePrice: base, ceilingPrice: round10k(base * 1.3) });

// "start"/"end" span every night; each night runs the same hours on its own day
// (an end hour before the start hour means the show runs past midnight)
function nights(start, end) {
  const [startDay, startHour] = start.split("T");
  const [endDay, endHour] = end.split("T");
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((Date.parse(endDay) - Date.parse(startDay)) / dayMs);
  const count = days + 1 - (endHour < startHour ? 1 : 0);
  return Array.from({ length: count }, (_, k) => ({
    name: `Đêm ${k + 1}`,
    startTime: new Date(t(start).getTime() + k * dayMs),
    endTime: new Date(t(end).getTime() - (count - 1 - k) * dayMs),
  }));
}

const EVENTS = [
  {
    name: "Vietnam Airlines Classic – Hanoi Concert 2026: London Symphony Orchestra",
    artist: "London Symphony Orchestra · chỉ huy Sir Antonio Pappano",
    genres: ["classical"],
    location: "Nhà hát Hồ Gươm",
    provinceCode: HANOI,
    start: "2026-10-02T20:00", end: "2026-10-03T22:00",
    saleStart: "2026-08-20T10:00", saleEnd: "2026-10-03T18:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-08-20T10:00", end: "2026-10-03T18:00" }],
    zones: [
      ["Hạng A – Tầng trệt", 520, 4_500_000],
      ["Hạng B – Tầng trệt", 480, 3_200_000],
      ["Hạng C – Tầng lửng", 400, 2_200_000],
      ["Ban công", 300, 1_200_000],
    ],
  },
  {
    name: "Chillies – Tour Lại Từ Đầu 2026 (TP.HCM)",
    artist: "Chillies",
    genres: ["indie-rock", "alternative-rock", "v-pop"],
    location: "Địa điểm đang cập nhật",
    provinceCode: HCMC,
    start: "2026-10-03T19:30", end: "2026-10-04T22:30",
    saleStart: "2026-08-25T10:00", saleEnd: "2026-10-04T17:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-08-25T10:00", end: "2026-10-04T17:00" }],
    zones: [
      ["Fanzone", 800, 1_500_000],
      ["Vé thường", 2_200, 900_000],
    ],
  },
  {
    name: "SAO Concert – The Stardom Music Festival | GLAMOROUS",
    artist: "SOOBIN, Binz, Rhymastic, Quang Hùng MasterD, Dương Domic, RHYDER, B Ray, F.HERO và gần 60 nghệ sĩ",
    genres: ["v-pop", "hip-hop", "pop", "r-and-b", "rock", "indie-pop"],
    location: "Vạn Phúc City",
    provinceCode: HCMC,
    start: "2026-10-10T10:00", end: "2026-10-10T23:59",
    saleStart: "2026-08-15T10:00", saleEnd: "2026-10-10T08:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-08-15T10:00", end: "2026-10-10T08:00" }],
    zones: [
      ["VIP Standing", 3_000, 2_500_000],
      ["GA Standing", 18_000, 900_000],
      ["Khán đài", 4_000, 1_400_000],
    ],
  },
  {
    name: "Tinh Hà “Say Hi” Concert – Hẹn Giữa Tinh Hà",
    artist: "Dàn 24 nghệ sĩ Tinh Hà “Say Hi” (Vie Channel)",
    genres: ["v-pop", "pop", "hip-hop"],
    location: "Vạn Phúc City – Sân số 2",
    provinceCode: HCMC,
    start: "2026-10-17T19:00", end: "2026-10-17T23:00",
    saleStart: "2026-09-05T12:00", saleEnd: "2026-10-17T12:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-09-05T12:00", end: "2026-10-17T12:00" }],
    zones: [
      ["Tinh Hà Package", 200, 50_000_000],
      ["VIP", 3_000, 5_000_000],
      ["GA", 8_000, 2_500_000],
      ["Standing xa", 6_000, 1_200_000],
    ],
  },
  {
    name: "Anh Trai Vượt Ngàn Chông Gai 2026 – Concert Day 1 & Day 2",
    artist: "34 Anh Tài mùa 2026",
    genres: ["v-pop", "pop", "ballad", "rock"],
    location: "KĐT Phú Long – Bình Trưng (The Global City)",
    provinceCode: HCMC,
    start: "2026-10-17T18:30", end: "2026-10-18T23:00",
    saleStart: "2026-08-19T12:00", saleEnd: "2026-10-18T12:00",
    phases: [
      { name: "Mở bán sớm", start: "2026-08-19T12:00", end: "2026-08-31T23:59" },
      { name: "Mở bán chính thức", start: "2026-09-01T12:00", end: "2026-10-18T12:00" },
    ],
    zones: [
      ["Chông Gai VIP", 1_500, 10_000_000],
      ["Hạng Vàng", 5_000, 6_000_000],
      ["Hạng Bạc", 8_000, 3_500_000],
      ["Khu đứng", 10_500, 1_800_000],
    ],
  },
  {
    name: "Phùng Khánh Linh – Giữa Một Vạn Tour (Bản mở rộng)",
    artist: "Phùng Khánh Linh",
    genres: ["indie-pop", "v-pop"],
    location: "Nhà thi đấu Phú Thọ",
    provinceCode: HCMC,
    start: "2026-10-17T19:30", end: "2026-10-17T22:30",
    saleStart: "2026-08-28T10:00", saleEnd: "2026-10-17T17:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-08-28T10:00", end: "2026-10-17T17:00" }],
    zones: [
      ["VIP", 500, 2_200_000],
      ["Hạng 1", 1_500, 1_500_000],
      ["Hạng 2", 2_000, 900_000],
    ],
  },
  {
    name: "Tiffany Young: Edge of Calm Tour in Ho Chi Minh City",
    artist: "Tiffany Young (Girls' Generation)",
    genres: ["k-pop", "pop"],
    location: "Nhà thi đấu Nguyễn Du",
    provinceCode: HCMC,
    start: "2026-10-17T19:30", end: "2026-10-17T22:00",
    saleStart: "2026-09-15T12:00", saleEnd: "2026-10-17T17:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-09-15T12:00", end: "2026-10-17T17:00" }],
    zones: [
      ["VIP Standing", 600, 5_500_000],
      ["CAT 1", 800, 4_200_000],
      ["CAT 2", 1_000, 3_000_000],
      ["CAT 3", 1_200, 1_800_000],
    ],
  },
  {
    name: "BIGBANG 2026–2027 WORLD TOUR <XX : COSMOS> IN HANOI",
    artist: "BIGBANG (G-DRAGON, TAEYANG, DAESUNG)",
    genres: ["k-pop", "hip-hop", "pop"],
    location: "SVĐ Quốc gia Mỹ Đình",
    provinceCode: HANOI,
    start: "2026-10-24T19:30", end: "2026-10-25T22:30",
    saleStart: "2026-08-14T10:00", saleEnd: "2026-10-25T12:00",
    // early access, not a discount: the published prices apply in both phases
    earlyDiscount: false,
    phases: [
      { name: "Mở bán sớm", start: "2026-08-14T10:00", end: "2026-08-16T23:59" },
      { name: "Mở bán chính thức", start: "2026-08-17T10:00", end: "2026-10-25T12:00" },
    ],
    // the ten published tiers and prices
    zones: [
      ["ULTIMATE VIP PACKAGE", 300, 10_500_000],
      ["DIAMOND VIP PACKAGE", 500, 9_800_000],
      ["GOLD VIP PACKAGE", 1_000, 8_500_000],
      ["PREMIUM SEATING", 2_000, 7_500_000],
      ["STANDING ZONE", 8_000, 4_500_000],
      ["CAT 1", 5_000, 6_500_000],
      ["CAT 2", 6_000, 5_500_000],
      ["CAT 3", 7_000, 3_500_000],
      ["CAT 4", 6_000, 2_000_000],
      ["CAT 5", 4_000, 1_000_000],
    ],
  },
  {
    name: "Mr Siro – Encore Extended: Ai Cũng Giấu Trong Lòng Tảng Băng",
    artist: "Mr Siro",
    genres: ["ballad", "v-pop"],
    location: "Trung tâm Hội nghị Quốc gia",
    provinceCode: HANOI,
    start: "2026-11-01T19:00", end: "2026-11-01T22:00",
    saleStart: "2026-09-10T12:00", saleEnd: "2026-11-01T15:00",
    phases: [{ name: "Mở bán chính thức", start: "2026-09-10T12:00", end: "2026-11-01T15:00" }],
    zones: [
      ["VVIP", 300, 3_500_000],
      ["VIP", 700, 2_500_000],
      ["Hạng 1", 1_000, 1_600_000],
      ["Hạng 2", 1_500, 800_000],
    ],
  },
  {
    name: "Liên Quân 10Fest – Đại Nhạc Hội 10 Tuổi",
    artist: "Đại nhạc hội kỷ niệm 10 năm Liên Quân Mobile",
    genres: ["v-pop", "edm", "hip-hop"],
    location: "SVĐ Quốc gia Mỹ Đình",
    provinceCode: HANOI,
    start: "2026-11-08T18:00", end: "2026-11-08T23:00",
    saleStart: "2026-09-26T10:00", saleEnd: "2026-11-08T14:00",
    phases: [{ name: "Mở bán đại chúng", start: "2026-09-26T10:00", end: "2026-11-08T14:00" }],
    zones: [
      ["VIP", 3_000, 1_699_000],
      ["Standing", 10_000, 999_000],
      ["CAT 1", 12_000, 699_000],
      ["CAT 2", 15_000, 299_000],
    ],
  },
  {
    name: "Tùng Dương – Live Concert “Bay Về Phía Mặt Trời”",
    artist: "Tùng Dương",
    genres: ["v-pop", "jazz", "rock"],
    location: "SVĐ Quốc gia Mỹ Đình",
    provinceCode: HANOI,
    start: "2026-12-19T20:00", end: "2026-12-19T23:00",
    saleStart: "2026-10-20T10:00", saleEnd: "2026-12-19T14:00",
    phases: [
      { name: "Mở bán sớm", start: "2026-10-20T10:00", end: "2026-11-05T23:59" },
      { name: "Mở bán chính thức", start: "2026-11-06T10:00", end: "2026-12-19T14:00" },
    ],
    zones: [
      ["VVIP", 1_000, 5_000_000],
      ["VIP", 4_000, 3_500_000],
      ["Hạng 1", 10_000, 2_500_000],
      ["Hạng 2", 15_000, 1_500_000],
      ["Hạng 3", 15_000, 800_000],
    ],
  },
];

async function main() {
  await seedProvinces(prisma);
  await seedGenres(prisma);

  for (const ev of EVENTS) {
    await prisma.event.deleteMany({ where: { name: ev.name } });
    const created = await prisma.event.create({
      data: {
        name: ev.name,
        artist: ev.artist,
        location: ev.location,
        provinceCode: ev.provinceCode,
        startTime: t(ev.start),
        endTime: t(ev.end),
        saleStart: t(ev.saleStart),
        saleEnd: t(ev.saleEnd),
        genres: { connect: ev.genres.map((slug) => ({ slug })) },
        zones: { create: ev.zones.map(([name]) => ({ name })) },
        phases: { create: ev.phases.map((p) => ({ name: p.name, startTime: t(p.start), endTime: t(p.end) })) },
        shows: { create: nights(ev.start, ev.end) },
      },
      include: { zones: true, phases: true, shows: true },
    });

    // a zone's seats are physical, so every night sells the zone's full capacity
    await prisma.zoneQuota.createMany({
      data: created.zones.flatMap((zone) =>
        created.shows.map((show) => ({
          zoneId: zone.id,
          showId: show.id,
          capacity: ev.zones.find(([name]) => name === zone.name)[1],
        })),
      ),
    });

    // every zone gets a price in every phase; a first "early" phase runs 10% under the base
    const prices = [];
    created.phases.forEach((phase, i) => {
      const earlyBird = ev.earlyDiscount !== false && created.phases.length > 1 && i === 0;
      for (const zone of created.zones) {
        const listed = ev.zones.find(([name]) => name === zone.name)[2];
        const base = earlyBird ? round10k(listed * 0.9) : listed;
        prices.push({ zoneId: zone.id, phaseId: phase.id, ...bounds(base) });
      }
    });
    await prisma.zonePrice.createMany({ data: prices });
    console.log(`✓ ${ev.name} — ${created.shows.length} đêm, ${created.zones.length} khu, ${created.phases.length} đợt`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
