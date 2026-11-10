// Copies the old SQLite database (prisma/dev.db) into an empty Postgres database, and with
// --images also uploads the images it uses to the (private) Vercel Blob store. Image URLs stay
// /api/uploads/<name>; the app serves them from Blob once BLOB_READ_WRITE_TOKEN is set.
//
//   TARGET_DATABASE_URL=postgres://… node prisma/copy-to-postgres.mjs [--skip-orders] [--images]
//
// The target is never read from .env, so a copy only ever goes where it was explicitly sent.
// Run `prisma migrate deploy` against the target first.
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { put } from "@vercel/blob";

// parents before children, so every foreign key finds its row
const TABLES = [
  "Province",
  "Genre",
  "Artist",
  "Event",
  "_ArtistToEvent",
  "_EventToGenre",
  "Zone",
  "Show",
  "ZoneQuota",
  "SalePhase",
  "ZonePrice",
  "Order",
  "SeatReservation",
];
const ORDERS = ["Order", "SeatReservation"];
const IMAGE_COLUMNS = { Event: ["imageUrl", "seatMapUrl"], Artist: ["imageUrl"] };
const UPLOAD = /^\/api\/uploads\/([0-9a-f-]{36}\.(jpg|png|webp))$/;

const args = new Set(process.argv.slice(2));
const target = process.env.TARGET_DATABASE_URL;
if (!target) throw new Error("TARGET_DATABASE_URL is required");
if (args.has("--images")) {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("--images needs BLOB_READ_WRITE_TOKEN");
}

const source = new DatabaseSync("prisma/dev.db", { readOnly: true });
const known = source
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'")
  .all()
  .map((r) => r.name);
const missed = known.filter((t) => !TABLES.includes(t));
if (missed.length) throw new Error(`tables this script does not copy yet: ${missed.join(", ")}`);

const db = new pg.Client({ connectionString: target });
await db.connect();

const { rows: present } = await db.query(`SELECT count(*)::int AS n FROM "Event"`);
if (present[0].n > 0) throw new Error("the target already has events; this script only fills an empty database");

/** column name → Postgres type, to turn SQLite's text dates and 0/1 flags back into real values */
async function columnTypes(table) {
  const { rows } = await db.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
}

const uploaded = new Map();
async function moveImage(url) {
  const name = url && UPLOAD.exec(url)?.[1];
  if (!name || !args.has("--images")) return url;
  if (!uploaded.has(url)) {
    const file = path.join("uploads", name);
    if (!existsSync(file)) {
      console.warn(`missing image ${file}; the event keeps no image`);
      uploaded.set(url, null);
    } else {
      await put(`uploads/${name}`, readFileSync(file), { access: "private", addRandomSuffix: false, allowOverwrite: true });
      uploaded.set(url, url);
    }
  }
  return uploaded.get(url);
}

await db.query("BEGIN");
try {
  for (const table of TABLES) {
    if (args.has("--skip-orders") && ORDERS.includes(table)) continue;
    const rows = source.prepare(`SELECT * FROM "${table}"`).all();
    if (rows.length === 0) continue;
    const types = await columnTypes(table);
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = [];
      for (const column of columns) {
        let value = row[column];
        if (value !== null && types[column]?.startsWith("timestamp")) value = new Date(value);
        else if (value !== null && types[column] === "boolean") value = value === 1;
        else if (IMAGE_COLUMNS[table]?.includes(column)) value = await moveImage(value);
        values.push(value);
      }
      await db.query(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        values,
      );
    }
    console.log(`${table}: ${rows.length}`);
  }
  await db.query("COMMIT");
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  await db.end();
}
if (args.has("--images")) console.log(`images uploaded to Blob: ${[...uploaded.values()].filter(Boolean).length}`);
