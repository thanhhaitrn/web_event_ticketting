-- CreateTable
CREATE TABLE "PriceWatch" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "matchedPrice" INTEGER,
    "matchedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "PriceWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFeedback" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "showId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceWatch_showId_matchedAt_idx" ON "PriceWatch"("showId", "matchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceWatch_buyerId_showId_zoneId_key" ON "PriceWatch"("buyerId", "showId", "zoneId");

-- CreateIndex
CREATE INDEX "EventFeedback_showId_idx" ON "EventFeedback"("showId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFeedback_buyerId_showId_key" ON "EventFeedback"("buyerId", "showId");

-- AddForeignKey
ALTER TABLE "PriceWatch" ADD CONSTRAINT "PriceWatch_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceWatch" ADD CONSTRAINT "PriceWatch_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFeedback" ADD CONSTRAINT "EventFeedback_showId_fkey" FOREIGN KEY ("showId") REFERENCES "Show"("id") ON DELETE CASCADE ON UPDATE CASCADE;

