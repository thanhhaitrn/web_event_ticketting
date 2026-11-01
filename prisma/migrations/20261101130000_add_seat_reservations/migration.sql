-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "activeKey" TEXT,
    "seatCount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "showId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "SeatReservation_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeatReservation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeatReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_activeKey_key" ON "Order"("activeKey");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SeatReservation_status_expiresAt_idx" ON "SeatReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "SeatReservation_orderId_idx" ON "SeatReservation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_showId_zoneId_seatNumber_key" ON "SeatReservation"("showId", "zoneId", "seatNumber");

