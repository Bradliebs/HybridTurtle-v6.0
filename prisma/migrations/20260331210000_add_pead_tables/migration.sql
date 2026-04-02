-- CreateTable
CREATE TABLE IF NOT EXISTS "PeadCandidate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "announcementDate" DATETIME NOT NULL,
    "announcementTiming" TEXT NOT NULL,
    "actualEPS" REAL NOT NULL,
    "estimateEPS" REAL NOT NULL,
    "surprisePct" REAL NOT NULL,
    "signalStrength" TEXT NOT NULL,
    "crossConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "qualityTier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PeadPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "candidateId" INTEGER NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "entryPrice" REAL NOT NULL,
    "stopPrice" REAL NOT NULL,
    "positionSizePct" REAL NOT NULL,
    "sharesHeld" INTEGER,
    "tradingDaysHeld" INTEGER NOT NULL DEFAULT 0,
    "currentPrice" REAL,
    "currentDriftPct" REAL,
    "status" TEXT NOT NULL,
    "closeDate" DATETIME,
    "closePrice" REAL,
    "closeReason" TEXT,
    "pnlPct" REAL,
    "pnlAbsolute" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeadPosition_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PeadCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PeadDailySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "positionId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "tradingDay" INTEGER NOT NULL,
    "price" REAL NOT NULL,
    "driftPct" REAL NOT NULL,
    "stopPrice" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeadDailySnapshot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "PeadPosition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PeadCandidate_ticker_idx" ON "PeadCandidate"("ticker");
CREATE INDEX IF NOT EXISTS "PeadCandidate_announcementDate_idx" ON "PeadCandidate"("announcementDate");
CREATE INDEX IF NOT EXISTS "PeadCandidate_status_idx" ON "PeadCandidate"("status");
CREATE INDEX IF NOT EXISTS "PeadPosition_status_idx" ON "PeadPosition"("status");
CREATE INDEX IF NOT EXISTS "PeadPosition_candidateId_idx" ON "PeadPosition"("candidateId");
CREATE INDEX IF NOT EXISTS "PeadDailySnapshot_positionId_idx" ON "PeadDailySnapshot"("positionId");
