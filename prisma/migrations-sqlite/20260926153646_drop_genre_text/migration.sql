-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "artist" TEXT,
    "genreSlug" TEXT,
    "location" TEXT NOT NULL,
    "provinceCode" INTEGER,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "saleStart" DATETIME NOT NULL,
    "saleEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_genreSlug_fkey" FOREIGN KEY ("genreSlug") REFERENCES "Genre" ("slug") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Event_provinceCode_fkey" FOREIGN KEY ("provinceCode") REFERENCES "Province" ("code") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("artist", "createdAt", "endTime", "genreSlug", "id", "location", "name", "provinceCode", "saleEnd", "saleStart", "startTime", "updatedAt") SELECT "artist", "createdAt", "endTime", "genreSlug", "id", "location", "name", "provinceCode", "saleEnd", "saleStart", "startTime", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

