-- CreateTable
CREATE TABLE "BattleRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "battleId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "guildId" TEXT,
    "channelId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "winner" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "timelineJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "BattleRecord_battleId_key" ON "BattleRecord"("battleId");

-- CreateIndex
CREATE INDEX "BattleRecord_ownerUserId_idx" ON "BattleRecord"("ownerUserId");

-- CreateIndex
CREATE INDEX "BattleRecord_createdAt_idx" ON "BattleRecord"("createdAt");
