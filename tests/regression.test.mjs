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
    for (const body of [null, [], { ...eventBody, name: "   " }, { ...eventBody, saleEnd: "bad" }, { ...eventBody, saleEnd: "2026-08-01" }, { ...eventBody, artist: {} }]) {
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
  } finally {
    await prisma.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
