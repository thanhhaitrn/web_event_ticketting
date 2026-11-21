-- [PHẦN 02 — CẢI TIẾN: PRICING COPILOT]  Thành phần 3 — DemandLog (PostgreSQL)

CREATE TABLE "DemandLog" (
    "id"       TEXT     NOT NULL PRIMARY KEY,
    "zoneId"   TEXT     NOT NULL,
    "showId"   TEXT     NOT NULL,
    "phaseId"  TEXT     NOT NULL,
    "cycle"    INTEGER NOT NULL,
    "at"       TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER  NOT NULL,
    "sold"     INTEGER  NOT NULL,
    "held"     INTEGER  NOT NULL,
    "price"    INTEGER  NOT NULL,
    CONSTRAINT "DemandLog_zoneId_fkey"  FOREIGN KEY ("zoneId")  REFERENCES "Zone" ("id")      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemandLog_showId_fkey"  FOREIGN KEY ("showId")  REFERENCES "Show" ("id")      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DemandLog_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "SalePhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DemandLog_zoneId_showId_phaseId_at_idx"
    ON "DemandLog" ("zoneId", "showId", "phaseId", "at");

CREATE UNIQUE INDEX "DemandLog_zoneId_showId_phaseId_cycle_key"
    ON "DemandLog" ("zoneId", "showId", "phaseId", "cycle");
