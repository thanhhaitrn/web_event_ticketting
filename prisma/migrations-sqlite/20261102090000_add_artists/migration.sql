-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "_ArtistToEvent" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ArtistToEvent_A_fkey" FOREIGN KEY ("A") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArtistToEvent_B_fkey" FOREIGN KEY ("B") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_slug_key" ON "Artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_ArtistToEvent_AB_unique" ON "_ArtistToEvent"("A", "B");

-- CreateIndex
CREATE INDEX "_ArtistToEvent_B_index" ON "_ArtistToEvent"("B");


-- Backfill: each distinct artist text becomes one artist, so nothing is lost.
-- The slug is a placeholder until prisma/seed-artists.mjs gives it a readable one.
INSERT INTO "Artist" ("id", "slug", "name", "createdAt")
SELECT lower(hex(randomblob(12))), 'artist-' || lower(hex(randomblob(6))), "artist", strftime('%Y-%m-%dT%H:%M:%S.000+00:00', 'now')
FROM (SELECT DISTINCT "artist" FROM "Event" WHERE "artist" IS NOT NULL AND trim("artist") <> '');

INSERT INTO "_ArtistToEvent" ("A", "B")
SELECT "Artist"."id", "Event"."id"
FROM "Event" JOIN "Artist" ON "Artist"."name" = "Event"."artist";
