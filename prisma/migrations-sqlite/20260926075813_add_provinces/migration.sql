-- CreateTable
CREATE TABLE "Province" (
    "code" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "artist" TEXT,
    "genre" TEXT,
    "location" TEXT NOT NULL,
    "provinceCode" INTEGER,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "saleStart" DATETIME NOT NULL,
    "saleEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_provinceCode_fkey" FOREIGN KEY ("provinceCode") REFERENCES "Province" ("code") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("artist", "createdAt", "endTime", "genre", "id", "location", "name", "saleEnd", "saleStart", "startTime", "updatedAt") SELECT "artist", "createdAt", "endTime", "genre", "id", "location", "name", "saleEnd", "saleStart", "startTime", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Province_name_key" ON "Province"("name");
