-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initiatorUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "offerType" TEXT NOT NULL,
    "offeredRelicIds" TEXT NOT NULL DEFAULT '[]',
    "offeredGold" INTEGER NOT NULL DEFAULT 0,
    "offeredMaterials" TEXT NOT NULL DEFAULT '{}',
    "requestedRelicIds" TEXT NOT NULL DEFAULT '[]',
    "requestedGold" INTEGER NOT NULL DEFAULT 0,
    "requestedMaterials" TEXT NOT NULL DEFAULT '{}',
    "message" TEXT,
    "parentOfferId" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "escrowLocked" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "TradeHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeOfferId" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "user1Gave" TEXT NOT NULL,
    "user2Gave" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeValue" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "TradeOffer_initiatorUserId_idx" ON "TradeOffer"("initiatorUserId");

-- CreateIndex
CREATE INDEX "TradeOffer_targetUserId_idx" ON "TradeOffer"("targetUserId");

-- CreateIndex
CREATE INDEX "TradeOffer_status_idx" ON "TradeOffer"("status");

-- CreateIndex
CREATE INDEX "TradeOffer_createdAt_idx" ON "TradeOffer"("createdAt");

-- CreateIndex
CREATE INDEX "TradeHistory_user1Id_idx" ON "TradeHistory"("user1Id");

-- CreateIndex
CREATE INDEX "TradeHistory_user2Id_idx" ON "TradeHistory"("user2Id");

-- CreateIndex
CREATE INDEX "TradeHistory_completedAt_idx" ON "TradeHistory"("completedAt");
