-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "materials" TEXT NOT NULL DEFAULT '{}',
    "currencies" TEXT NOT NULL DEFAULT '{}',
    "lastDailyClaimAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "discordId", "gold", "materials", "updatedAt", "userId") SELECT "createdAt", "discordId", "gold", "materials", "updatedAt", "userId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
