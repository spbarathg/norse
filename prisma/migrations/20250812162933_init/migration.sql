-- CreateTable
CREATE TABLE "Era" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startIgTs" TEXT NOT NULL,
    "endIgTs" TEXT,
    "visualId" TEXT NOT NULL,
    "decayModifier" REAL NOT NULL DEFAULT 1,
    "evoCeilingModifier" REAL NOT NULL DEFAULT 1,
    "specialFlags" TEXT
);

-- CreateTable
CREATE TABLE "Relic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" INTEGER NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "originUserId" TEXT NOT NULL,
    "eraId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "birthIgTs" TEXT NOT NULL,
    "birthRealTs" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durabilityPct" REAL NOT NULL DEFAULT 100,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "evolutionStage" TEXT NOT NULL DEFAULT 'Dormant',
    "currentStats" TEXT NOT NULL,
    "isShadowborn" BOOLEAN NOT NULL DEFAULT false,
    "rebirthIgTs" TEXT,
    "history" TEXT NOT NULL DEFAULT '[]',
    "lastDecayTick" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preservationExpiry" DATETIME,
    "metadata" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "missionLockId" TEXT,
    CONSTRAINT "Relic_eraId_fkey" FOREIGN KEY ("eraId") REFERENCES "Era" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "materials" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT NOT NULL,
    "relicIds" TEXT NOT NULL,
    "missionType" TEXT NOT NULL,
    "startRealTs" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endRealTs" DATETIME NOT NULL,
    "rewardPayload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "claimedAt" DATETIME
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerUserId" TEXT NOT NULL,
    "buyerUserId" TEXT,
    "relicId" TEXT NOT NULL,
    "priceGold" INTEGER NOT NULL,
    "createdTs" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "viewCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "scheduledIgTs" TEXT NOT NULL,
    "status" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Relic_ownerUserId_idx" ON "Relic"("ownerUserId");

-- CreateIndex
CREATE INDEX "Relic_durabilityPct_idx" ON "Relic"("durabilityPct");

-- CreateIndex
CREATE INDEX "Relic_eraId_idx" ON "Relic"("eraId");

-- CreateIndex
CREATE INDEX "Relic_rarity_idx" ON "Relic"("rarity");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");

-- CreateIndex
CREATE INDEX "Mission_ownerUserId_idx" ON "Mission"("ownerUserId");

-- CreateIndex
CREATE INDEX "Mission_status_idx" ON "Mission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketListing_relicId_key" ON "MarketListing"("relicId");

-- CreateIndex
CREATE INDEX "MarketListing_status_idx" ON "MarketListing"("status");
