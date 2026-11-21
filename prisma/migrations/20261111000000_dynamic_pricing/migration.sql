-- [PHẦN 01 — DYNAMIC PRICING v1.1]  S2-04 (PostgreSQL)

-- ZonePrice.dynamicEnabled, mặc định tắt
ALTER TABLE "ZonePrice" ADD COLUMN "dynamicEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Lịch sử giá động
CREATE TABLE "PriceChange" (
    "id"        TEXT     NOT NULL PRIMARY KEY,
    "zoneId"    TEXT     NOT NULL,
    "showId"    TEXT     NOT NULL,
    "phaseId"   TEXT     NOT NULL,
    "cycle"     INTEGER  NOT NULL,
    "oldPrice"  INTEGER  NOT NULL,
    "newPrice"  INTEGER  NOT NULL,
    "occupancy" DOUBLE PRECISION NOT NULL,
    "expected"  DOUBLE PRECISION NOT NULL,
    "rule"      TEXT     NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceChange_zoneId_fkey"  FOREIGN KEY ("zoneId")  REFERENCES "Zone" ("id")      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceChange_showId_fkey"  FOREIGN KEY ("showId")  REFERENCES "Show" ("id")      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PriceChange_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "SalePhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Mỗi (khu vực, đêm, đợt, chu kỳ 15 phút) tối đa một lần đổi giá
CREATE UNIQUE INDEX "PriceChange_zoneId_showId_phaseId_cycle_key"
    ON "PriceChange" ("zoneId", "showId", "phaseId", "cycle");

CREATE INDEX "PriceChange_zoneId_showId_phaseId_createdAt_idx"
    ON "PriceChange" ("zoneId", "showId", "phaseId", "createdAt");
