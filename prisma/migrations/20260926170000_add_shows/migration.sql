-- CreateTable
CREATE TABLE "Show" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Show_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZoneQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoneQuota_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoneQuota_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoneQuota_zoneId_showId_key" ON "ZoneQuota"("zoneId", "showId");


-- Backfill: one show per local (UTC+7) calendar day the event spans, each running
-- from the event's start time-of-day to its end time-of-day. An end time earlier in
-- the day than the start means the show runs past midnight, so that day is not a new night.
WITH RECURSIVE
  "span" AS (
    SELECT
      "id" AS "eventId",
      "startTime",
      "endTime",
      CAST(
        julianday(date("endTime", '+7 hours')) - julianday(date("startTime", '+7 hours'))
        AS INTEGER
      ) + 1
        - (time("endTime", '+7 hours') < time("startTime", '+7 hours')) AS "nights"
    FROM "Event"
  ),
  "night" AS (
    SELECT "eventId", "startTime", "endTime", "nights", 0 AS "k" FROM "span"
    UNION ALL
    SELECT "eventId", "startTime", "endTime", "nights", "k" + 1 FROM "night"
    WHERE "k" + 1 < "nights"
  )
INSERT INTO "Show" ("id", "eventId", "name", "startTime", "endTime", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(12))),
  "eventId",
  'Đêm ' || ("k" + 1),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', "startTime", '+' || "k" || ' days'),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', "endTime", '-' || ("nights" - 1 - "k") || ' days'),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now'),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
FROM "night";

-- a zone's seats are physical, so every night sells the zone's full capacity
INSERT INTO "ZoneQuota" ("id", "zoneId", "showId", "capacity", "createdAt", "updatedAt")
SELECT
  lower(hex(randomblob(12))),
  "Zone"."id",
  "Show"."id",
  "Zone"."capacity",
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now'),
  strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
FROM "Zone" JOIN "Show" ON "Show"."eventId" = "Zone"."eventId";
