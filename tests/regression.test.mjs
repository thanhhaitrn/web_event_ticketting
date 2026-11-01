import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const root = process.cwd();
const require = createRequire(import.meta.url);
// Execute the actual route handlers against a disposable SQLite database.
// Only the database connection is substituted; validation and queries are real.
function loader(prisma) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const resolve = (id) => id === "@/lib/prisma" ? { prisma } : id.startsWith("@/") ? load(`${id.slice(2)}.ts`) : require(id);
    new Function("require", "module", "exports", source)(resolve, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

const load = loader();
const { dateWindow, matchesDate } = load("lib/browse.ts");
const { saleSummary } = load("lib/sales.ts");

test("date filtering includes a later night, without including dates between nights", () => {
  const shows = [new Date("2026-10-02T13:00Z"), new Date("2026-10-04T13:00Z")];
  const range = dateWindow("range", "2026-10-04", "2026-10-04");
  assert.equal(shows.some((s) => matchesDate(s, ...range)), true);
  assert.equal(shows.some((s) => matchesDate(s, ...dateWindow("range", "2026-10-03", "2026-10-03"))), false);
  assert.equal(matchesDate(new Date("2026-10-03T17:00Z"), ...range), true);
  assert.equal(matchesDate(new Date("2026-10-04T17:00Z"), ...range), false);
});

test("Vietnam date windows are independent of server timezone and reject invalid dates", () => {
  const now = new Date("2026-09-30T18:00Z");
  assert.deepEqual(dateWindow("today", "", "", now).map((d) => d.toISOString()), ["2026-09-30T17:00:00.000Z", "2026-10-01T16:59:59.999Z"]);
  assert.equal(dateWindow("month", "", "", now)[1].toISOString(), "2026-10-31T16:59:59.999Z");
  assert.equal(dateWindow("week", "", "", now)[1].toISOString(), "2026-10-04T16:59:59.999Z");
  assert.deepEqual(dateWindow("range", "2026-02-30", "2026-03-01"), [null, null]);
  assert.deepEqual(dateWindow("range", "2026-10-04", "2026-10-03"), [null, null]);
});

test("sale status selects adjacent phases correctly and supports gaps and unsorted input", () => {
  const phases = [
    { id: "second", startTime: new Date("2026-10-02"), endTime: new Date("2026-10-03") },
    { id: "first", startTime: new Date("2026-10-01"), endTime: new Date("2026-10-02") },
  ];
  assert.equal(saleSummary(phases, new Date("2026-10-02")).phase.id, "second");
  assert.equal(saleSummary(phases, new Date("2026-10-03")).isSelling, false);
  assert.equal(saleSummary(phases, new Date("2026-09-30")).isUpcoming, true);
  assert.equal(saleSummary([], new Date()).isSelling, false);
  assert.equal(saleSummary([phases[1], { ...phases[0], startTime: new Date("2026-10-02T12:00Z") }], new Date("2026-10-02T06:00Z")).isSelling, false);
});

test("API regression: invalid requests cannot change data; valid edits still work", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ticketweb-regression-"));
  const dbFile = path.join(dir, "test.db");
  const db = new Database(dbFile);
  const schema = execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  db.exec(schema);
  db.close();
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
  const get = loader(prisma);
  const context = (id) => ({ params: Promise.resolve({ id }) });
  const req = (method, body) => new Request("http://localhost/api/test", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const eventBody = { name: "Test event", location: "Test venue", provinceCode: 1, startTime: "2026-10-04T12:00Z", endTime: "2026-10-04T15:00Z", saleStart: "2026-09-01T00:00Z", saleEnd: "2026-10-04T12:00Z" };
  try {
    await prisma.province.create({ data: { code: 1, name: "Test", fullName: "Test" } });
    const events = get("app/api/events/route.ts");
    const first = await events.POST(req("POST", eventBody));
    assert.equal(first.status, 201);
    const a = await first.json();
    const second = await events.POST(req("POST", { ...eventBody, name: "Other event" }));
    assert.equal(second.status, 201);
    const b = await second.json();
    for (const body of [null, [], { ...eventBody, name: "   " }, { ...eventBody, saleEnd: "bad" }, { ...eventBody, saleEnd: "2026-08-01" }, { ...eventBody, artists: {} }, { ...eventBody, artists: ["  "] }]) {
      assert.equal((await events.POST(req("POST", body))).status, 400);
    }
    assert.equal((await events.POST(new Request("http://localhost/api/events", { method: "POST", body: "{" }))).status, 400);
    assert.equal(await prisma.event.count(), 2);
    const zones = get("app/api/events/[id]/zones/route.ts");
    const zone = await (await zones.POST(req("POST", { name: "VIP" }), context(a.id))).json();
    assert.equal((await zones.POST(req("POST", { name: "VIP" }), context("missing"))).status, 404);
    const phases = get("app/api/events/[id]/phases/route.ts");
    const phaseBody = { name: "Phase", startTime: "2026-09-01T00:00Z", endTime: "2026-09-10T00:00Z" };
    const phase = await (await phases.POST(req("POST", phaseBody), context(a.id))).json();
    const foreign = await (await phases.POST(req("POST", phaseBody), context(b.id))).json();
    assert.equal((await phases.POST(req("POST", phaseBody), context(a.id))).status, 400);
    assert.equal((await phases.POST(req("POST", { ...phaseBody, endTime: "2026-08-01" }), context(a.id))).status, 400);
    assert.equal((await phases.POST(req("POST", { ...phaseBody, startTime: "2026-09-10T00:00Z", endTime: "2026-09-20T00:00Z" }), context(a.id))).status, 201);
    const phaseEdit = get("app/api/phases/[id]/route.ts");
    assert.equal((await phaseEdit.PATCH(req("PATCH", { endTime: "2026-09-11" }), context(phase.id))).status, 400);
    assert.equal((await phaseEdit.PATCH(req("PATCH", { startTime: null }), context(phase.id))).status, 400);
    assert.equal((await phaseEdit.PATCH(req("PATCH", { endTime: "2026-08-01" }), context(phase.id))).status, 400);
    assert.equal((await phaseEdit.PATCH(req("PATCH", { name: "Updated phase" }), context(phase.id))).status, 200);
    const prices = get("app/api/prices/route.ts");
    const priceBody = { zoneId: zone.id, phaseId: phase.id, floorPrice: 100, basePrice: 200, ceilingPrice: 300 };
    for (const body of [{ ...priceBody, phaseId: foreign.id }, { ...priceBody, basePrice: 200.5 }, { ...priceBody, ceilingPrice: 2147483648 }, { ...priceBody, basePrice: 99 }]) {
      assert.equal((await prices.POST(req("POST", body))).status, 400);
    }
    assert.equal((await prices.POST(req("POST", { ...priceBody, phaseId: "missing" }))).status, 404);
    assert.equal(await prisma.zonePrice.count(), 0);
    assert.equal((await prices.POST(req("POST", priceBody))).status, 200);
    assert.equal(await prisma.zonePrice.count(), 1);
    const eventEdit = get("app/api/events/[id]/route.ts");
    assert.equal((await eventEdit.PATCH(req("PATCH", { saleEnd: "2026-08-01" }), context(a.id))).status, 400);
    assert.equal((await eventEdit.PATCH(req("PATCH", { name: "" }), context(a.id))).status, 400);
    assert.equal((await eventEdit.PATCH(req("PATCH", { name: "Updated" }), context(a.id))).status, 200);
    assert.equal((await eventEdit.PATCH(req("PATCH", { name: "Updated" }), context("missing"))).status, 404);
    const zoneEdit = get("app/api/zones/[id]/route.ts");
    const show = await prisma.show.findFirst({ where: { eventId: a.id } });
    const otherShow = await prisma.show.findFirst({ where: { eventId: b.id } });
    for (const capacities of [null, [], "bad", { [show.id]: 1.5 }, { [show.id]: 2147483648 }, { [otherShow.id]: 2 }]) {
      assert.equal((await zoneEdit.PATCH(req("PATCH", { capacities }), context(zone.id))).status, 400);
    }
    assert.equal((await zoneEdit.PATCH(req("PATCH", { capacities: { [show.id]: 50 } }), context(zone.id))).status, 200);
    assert.equal((await prisma.zoneQuota.findFirst()).capacity, 50);
    assert.equal((await zoneEdit.DELETE(req("DELETE", {}), context("missing"))).status, 404);
    assert.equal((await get("app/api/shows/[id]/route.ts").PATCH(req("PATCH", { startTime: null }), context(show.id))).status, 400);

    // deleting nights goes through Event.removeShow + the repository
    const showEdit = get("app/api/shows/[id]/route.ts");
    assert.equal((await showEdit.DELETE(req("DELETE", {}), context(show.id))).status, 400); // last night stays
    const addNight = await get("app/api/events/[id]/shows/route.ts").POST(req("POST", { name: "Đêm 2", startTime: "2026-10-05T12:00Z", endTime: "2026-10-05T15:00Z" }), context(a.id));
    const night2 = await addNight.json();
    // two requests at once, each for a different night: neither may erase the other's count
    const [r1, r2] = await Promise.all([
      zoneEdit.PATCH(req("PATCH", { capacities: { [show.id]: 70 } }), context(zone.id)),
      zoneEdit.PATCH(req("PATCH", { capacities: { [night2.id]: 30 } }), context(zone.id)),
    ]);
    assert.deepEqual([r1.status, r2.status], [200, 200]);
    assert.deepEqual((await prisma.zoneQuota.findMany({ where: { zoneId: zone.id }, orderBy: { capacity: "asc" } })).map((q) => q.capacity), [30, 70]);
    assert.equal((await prisma.event.findUnique({ where: { id: a.id } })).endTime.toISOString(), "2026-10-05T15:00:00.000Z");
    assert.equal((await showEdit.DELETE(req("DELETE", {}), context(night2.id))).status, 200);
    assert.equal(await prisma.show.count({ where: { eventId: a.id } }), 1);
    assert.equal(await prisma.zoneQuota.count({ where: { showId: night2.id } }), 0);
    assert.equal((await prisma.event.findUnique({ where: { id: a.id } })).endTime.toISOString(), "2026-10-04T15:00:00.000Z");
    assert.equal((await showEdit.DELETE(req("DELETE", {}), context("missing"))).status, 404);
    // the price that was saved earlier survives the repository round trips
    assert.equal(await prisma.zonePrice.count(), 1);

    // create: sales may not open after the first night
    assert.equal((await events.POST(req("POST", { ...eventBody, saleStart: "2026-10-05T00:00Z", saleEnd: "2026-10-06T00:00Z" }))).status, 400);
    assert.equal((await events.POST(req("POST", { ...eventBody, genreSlugs: ["no-such-genre"] }))).status, 400);
    assert.equal((await events.POST(req("POST", { ...eventBody, provinceCode: 999 }))).status, 400);
    // edit: same sale-window rule, and a changed night moves the event's dates
    assert.equal((await eventEdit.PATCH(req("PATCH", { saleStart: "2026-10-05T00:00Z", saleEnd: "2026-10-06T00:00Z" }), context(a.id))).status, 400);
    assert.equal((await eventEdit.PATCH(req("PATCH", { artists: ["  Band  ", "BAND", "Tùng Dương"], location: " Hall " }), context(a.id))).status, 200);
    const edited = await prisma.event.findUnique({ where: { id: a.id }, include: { artists: { orderBy: { slug: "asc" } } } });
    assert.deepEqual([edited.location, edited.name], ["Hall", "Updated"]);
    // same name typed differently is one artist; a repeat save reuses the row
    assert.deepEqual(edited.artists.map((x) => [x.slug, x.name]), [["band", "Band"], ["tung-duong", "Tùng Dương"]]);
    const created = await (await events.POST(req("POST", { ...eventBody, name: "Band night", artists: ["band"] }))).json();
    assert.equal(await prisma.artist.count(), 2);
    assert.deepEqual((await prisma.event.findUnique({ where: { id: created.id }, include: { artists: true } })).artists.map((x) => x.name), ["Band"]);
    assert.equal((await eventEdit.PATCH(req("PATCH", { artists: [] }), context(created.id))).status, 200);
    assert.equal((await prisma.event.findUnique({ where: { id: created.id }, include: { artists: true } })).artists.length, 0);
    assert.equal((await eventEdit.DELETE(req("DELETE", {}), context(created.id))).status, 200);
    assert.equal((await showEdit.PATCH(req("PATCH", { endTime: "2026-10-04T18:00Z" }), context(show.id))).status, 200);
    assert.equal((await prisma.event.findUnique({ where: { id: a.id } })).endTime.toISOString(), "2026-10-04T18:00:00.000Z");
    // phases: moving one onto another is rejected like creating one there
    assert.equal((await phaseEdit.PATCH(req("PATCH", { startTime: "2026-09-12T00:00Z", endTime: "2026-09-15T00:00Z" }), context(phase.id))).status, 400);
    // deleting a phase takes its prices; deleting a zone takes its counts
    assert.equal((await phaseEdit.DELETE(req("DELETE", {}), context(phase.id))).status, 200);
    assert.equal(await prisma.zonePrice.count(), 0);
    assert.equal((await phaseEdit.DELETE(req("DELETE", {}), context(phase.id))).status, 404);
    assert.equal((await zoneEdit.DELETE(req("DELETE", {}), context(zone.id))).status, 200);
    assert.equal(await prisma.zoneQuota.count({ where: { zoneId: zone.id } }), 0);
    // deleting the event removes the whole aggregate
    assert.equal((await eventEdit.DELETE(req("DELETE", {}), context(b.id))).status, 200);
    assert.deepEqual([await prisma.show.count({ where: { eventId: b.id } }), await prisma.salePhase.count({ where: { eventId: b.id } })], [0, 0]);
    assert.equal((await eventEdit.DELETE(req("DELETE", {}), context(b.id))).status, 404);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("domain classes enforce the business rules", () => {
  const d = load("lib/domain.ts");
  const at = (iso) => new Date(iso);
  const range = (a, b) => new d.TimeRange(at(a), at(b));

  assert.throws(() => d.Money.vnd(-1), d.DomainError);
  assert.throws(() => d.Money.vnd(1.5), d.DomainError);
  assert.throws(() => d.Money.vnd(2147483648), d.DomainError);
  assert.throws(() => d.PriceBounds.fromAmounts(100, 50, 200), d.DomainError);
  assert.throws(() => d.PriceBounds.fromAmounts(100, 250, 200), d.DomainError);
  const bounds = d.PriceBounds.fromAmounts(100, 150, 200);
  assert.equal(bounds.clamp(d.Money.vnd(90)).getAmount(), 100);
  assert.equal(bounds.clamp(d.Money.vnd(999)).getAmount(), 200);
  assert.equal(bounds.clamp(d.Money.vnd(170)).getAmount(), 170);
  assert.throws(() => new d.Capacity(-1), d.DomainError);

  assert.throws(() => range("2026-10-02T00:00Z", "2026-10-01T00:00Z"), d.DomainError);
  assert.equal(d.TimeRange.tryParse("2026-10-02", "2026-10-01"), null);
  assert.equal(d.TimeRange.tryParse(null, "2026-10-01"), null);
  const phase = range("2026-10-01T00:00Z", "2026-10-02T00:00Z");
  assert.equal(phase.contains(at("2026-10-01T00:00Z")), true);
  assert.equal(phase.contains(at("2026-10-02T00:00Z")), false); // half-open, like lib/sales.ts
  assert.equal(d.TimeRange.span([]), null);

  assert.equal(d.Artist.fromName("  Tùng Dương ").getSlug(), "tung-duong");
  assert.throws(() => d.Artist.fromName("   "), d.DomainError);
  assert.throws(() => d.Artist.fromName("---"), d.DomainError);
  const event = d.Event.restore({
    artists: [],
    id: "e1", name: "Test", venue: new d.Venue("SVĐ", new d.Province(1, "Hà Nội", "Thành phố Hà Nội")), genres: [],
    saleWindow: range("2026-09-01T00:00Z", "2026-10-10T00:00Z"),
    shows: [{ id: "s1", name: "Đêm 1", time: range("2026-10-10T12:00Z", "2026-10-10T15:00Z") }],
    phases: [
      { id: "p2", name: "Chính thức", time: range("2026-09-10T00:00Z", "2026-10-10T00:00Z") },
      { id: "p1", name: "Sớm", time: range("2026-09-01T00:00Z", "2026-09-10T00:00Z") },
    ],
    zones: [{ id: "z1", name: "VIP", quotas: [{ showId: "s1", capacity: 100 }], prices: [{ phaseId: "p1", floor: 1, base: 2, ceiling: 3 }] }],
  });
  assert.equal(event.getVenue().label(), "SVĐ, Hà Nội");
  assert.throws(() => event.removeShow("s1"), /ít nhất một đêm/);
  const s2 = event.addShow(range("2026-10-11T12:00Z", "2026-10-11T15:00Z"));
  assert.equal(s2.getName(), "Đêm 2");
  event.setCapacity("z1", s2.id, new d.Capacity(40));
  assert.equal(event.zone("z1").totalCapacity().getValue(), 140);
  assert.equal(event.schedule().end.toISOString(), "2026-10-11T15:00:00.000Z");
  assert.throws(() => event.setCapacity("z1", "other-event-show", new d.Capacity(1)), d.DomainError);
  assert.throws(() => event.setPrice("z1", "other-event-phase", bounds), d.DomainError);
  event.removeShow(s2.id);
  assert.equal(event.zone("z1").totalCapacity().getValue(), 100);
  event.removeSalePhase("p1");
  assert.equal(event.zone("z1").priceFor("p1"), undefined);

  // sale status agrees with lib/sales.ts, which the public pages use
  for (const iso of ["2026-08-01T00:00Z", "2026-09-05T00:00Z", "2026-09-10T00:00Z", "2026-10-11T00:00Z"]) {
    const summary = saleSummary([{ id: "p2", startTime: at("2026-09-10T00:00Z"), endTime: at("2026-10-10T00:00Z") }], at(iso));
    const expected = summary.isSelling ? "on_sale" : summary.isUpcoming ? "upcoming" : "closed";
    assert.equal(event.saleStatus(at(iso)), expected, iso);
  }
});

test("seat holds: one buyer per seat, even under concurrency; holds expire after 5 minutes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ticketweb-seats-"));
  const dbFile = path.join(dir, "test.db");
  const db = new Database(dbFile);
  db.exec(execFileSync(path.join(root, "node_modules/.bin/prisma"), ["migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  db.close();
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
  const get = loader(prisma);
  const { seatService: seats } = get("lib/seat-service.ts");
  const { DomainError } = get("lib/domain.ts");
  const req = (method, body) => new Request("http://localhost/api/test", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const context = (id) => ({ params: Promise.resolve({ id }) });
  const statusOf = (promise) => promise.then(() => 200, (e) => { if (e instanceof DomainError) return e.status; throw e; });
  try {
    const event = await prisma.event.create({ data: {
      name: "Seats", location: "Hall", startTime: new Date("2099-01-01T12:00Z"), endTime: new Date("2099-01-01T15:00Z"),
      saleStart: new Date("2020-01-01T00:00Z"), saleEnd: new Date("2098-01-01T00:00Z"),
      shows: { create: { name: "Đêm 1", startTime: new Date("2099-01-01T12:00Z"), endTime: new Date("2099-01-01T15:00Z") } },
      phases: { create: { name: "Mở bán", startTime: new Date("2020-01-01T00:00Z"), endTime: new Date("2098-01-01T00:00Z") } },
      zones: { create: { name: "VIP" } },
    }, include: { shows: true, phases: true, zones: true } });
    const showId = event.shows[0].id, zoneId = event.zones[0].id;
    await prisma.zoneQuota.create({ data: { zoneId, showId, capacity: 100 } });
    await prisma.zonePrice.create({ data: { zoneId, phaseId: event.phases[0].id, floorPrice: 100, basePrice: 200, ceilingPrice: 300 } });
    const hold = (buyerId, list, now) => seats.hold({ buyerId, showId, zoneId, seats: list }, now);
    const reservations = () => prisma.seatReservation.count();

    // selection rules: at most 5, no duplicates, inside the zone
    for (const bad of [[], [1, 2, 3, 4, 5, 6], [1, 1], [101], [0], [1.5], "1"]) {
      assert.equal(await statusOf(hold("rules", bad)), 400, JSON.stringify(bad));
    }
    assert.equal(await reservations(), 0);

    // 100 people grab the same seat at once: exactly one gets it
    const race = await Promise.all(Array.from({ length: 100 }, (_, i) => hold(`racer-${i}`, [1]).then((o) => ({ o }), (e) => ({ e }))));
    const winners = race.filter((r) => r.o);
    assert.equal(winners.length, 1);
    assert.ok(race.filter((r) => r.e).every((r) => r.e instanceof DomainError && r.e.status === 409));
    assert.equal(await prisma.seatReservation.count({ where: { seatNumber: 1 } }), 1);

    // the database itself refuses a second row for a seat
    const winner = winners[0].o;
    await assert.rejects(prisma.seatReservation.create({ data: { showId, zoneId, seatNumber: 1, orderId: winner.id, status: "HELD", price: 1 } }), { code: "P2002" });

    // paying 20 times at once sells once, and a stranger can't pay for it
    const buyer = (await prisma.order.findUnique({ where: { id: winner.id } })).buyerId;
    assert.equal(await statusOf(seats.pay({ buyerId: "stranger", orderId: winner.id })), 404);
    await Promise.all(Array.from({ length: 20 }, () => seats.pay({ buyerId: buyer, orderId: winner.id })));
    assert.equal(await prisma.seatReservation.count({ where: { seatNumber: 1, status: "SOLD" } }), 1);
    assert.equal(await prisma.order.count({ where: { status: "PAID" } }), 1);
    // a sold seat stays sold, however long passes
    assert.equal(await statusOf(hold("late", [1], new Date(Date.now() + 86400000))), 409);

    // a hold is all-or-nothing, and each buyer gets one live hold per night
    assert.equal(await statusOf(hold("a", [1, 2])), 409);
    assert.equal(await prisma.seatReservation.count({ where: { seatNumber: 2 } }), 0);
    await hold("a", [2, 3]);
    assert.equal(await statusOf(hold("a", [4])), 409);
    const parallel = await Promise.all(Array.from({ length: 10 }, (_, i) => statusOf(hold("greedy", [10 + i]))));
    assert.equal(parallel.filter((s) => s === 200).length, 1);

    // the map shows sold / held / mine
    const map = await seats.status({ showId, zoneId, buyerId: "a", from: 1, to: 100 });
    assert.deepEqual([map.sold, map.mine], [[1], [2, 3]]);
    assert.equal(map.held.length, 1);
    assert.deepEqual(map.counts, { sold: 1, held: 3, available: 96 });
    // seat 1 is sold, 2 and 3 held, plus one held by "greedy" in the same first block
    assert.deepEqual(await seats.availability(showId), { zones: { [zoneId]: 96 }, taken: { [`${zoneId}:0`]: 4 } });
    // an expired hold no longer counts
    assert.deepEqual((await seats.availability(showId, new Date(Date.now() + 301000))).taken, { [`${zoneId}:0`]: 1 });

    // cancelling frees the seats at once
    const current = await seats.currentHold({ buyerId: "a", showId });
    await seats.cancel({ buyerId: "a", orderId: current.id });
    assert.equal(await prisma.seatReservation.count({ where: { seatNumber: 2 } }), 0);

    // expiry: 1 second before 5 minutes can still pay; at 5 minutes the seat is free and payment fails
    const t0 = new Date();
    const after = (s) => new Date(t0.getTime() + s * 1000);
    const early = await hold("b", [30], t0);
    await seats.pay({ buyerId: "b", orderId: early.id }, after(299));
    assert.equal(await prisma.seatReservation.count({ where: { seatNumber: 30, status: "SOLD" } }), 1);
    const slow = await hold("c", [31], t0);
    assert.equal(slow.secondsLeft, 300);
    assert.equal(await statusOf(hold("d", [31], after(299))), 409);
    const free = await seats.status({ showId, zoneId, from: 31, to: 31 }, after(300));
    assert.deepEqual([free.held, free.sold], [[], []]);
    assert.equal(await statusOf(seats.pay({ buyerId: "c", orderId: slow.id }, after(300))), 410);
    assert.equal(await seats.currentHold({ buyerId: "c", showId }, after(300)), null);
    await hold("d", [31], after(300));
    // the late buyer who lost the seat still can't pay, now that someone else holds it
    assert.equal(await statusOf(seats.pay({ buyerId: "c", orderId: slow.id }, after(301))), 410);
    assert.equal((await prisma.order.findUnique({ where: { id: slow.id } })).status, "EXPIRED");

    // organizers can't remove or shrink what people already hold or bought
    assert.equal((await get("app/api/shows/[id]/route.ts").DELETE(req("DELETE", {}), context(showId))).status, 409);
    assert.equal((await get("app/api/zones/[id]/route.ts").DELETE(req("DELETE", {}), context(zoneId))).status, 409);
    assert.equal((await get("app/api/events/[id]/route.ts").DELETE(req("DELETE", {}), context(event.id))).status, 409);
    assert.equal((await get("app/api/zones/[id]/route.ts").PATCH(req("PATCH", { capacities: { [showId]: 5 } }), context(zoneId))).status, 409);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
