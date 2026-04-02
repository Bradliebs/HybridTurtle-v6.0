-- CreateTable
CREATE TABLE IF NOT EXISTS "PairFormation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticker1" TEXT NOT NULL,
    "ticker2" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "isSeedPair" BOOLEAN NOT NULL DEFAULT false,
    "sector" TEXT NOT NULL,
    "formationStart" DATETIME NOT NULL,
    "formationEnd" DATETIME NOT NULL,
    "ssd" REAL NOT NULL,
    "correlation" REAL NOT NULL,
    "halfLife" REAL NOT NULL,
    "spreadMean" REAL NOT NULL,
    "spreadStd" REAL NOT NULL,
    "cointegrationPValue" REAL NOT NULL,
    "isCointegrated" BOOLEAN NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "deactivatedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "PairPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "formationId" INTEGER NOT NULL,
    "positionType" TEXT NOT NULL,
    "openDate" DATETIME NOT NULL,
    "entryZScore" REAL NOT NULL,
    "entrySpread" REAL NOT NULL,
    "longTicker" TEXT NOT NULL,
    "shortTicker" TEXT,
    "longEntryPrice" REAL NOT NULL,
    "shortEntryPrice" REAL,
    "longShares" INTEGER NOT NULL,
    "shortShares" INTEGER,
    "positionValueLong" REAL NOT NULL,
    "positionValueShort" REAL,
    "tradingDaysHeld" INTEGER NOT NULL DEFAULT 0,
    "currentZScore" REAL,
    "currentSpread" REAL,
    "status" TEXT NOT NULL,
    "closeDate" DATETIME,
    "closeReason" TEXT,
    "longClosePnlPct" REAL,
    "shortClosePnlPct" REAL,
    "combinedPnlPct" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairPosition_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "PairFormation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PairDailySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "positionId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "tradingDay" INTEGER NOT NULL,
    "zScore" REAL NOT NULL,
    "spread" REAL NOT NULL,
    "longPrice" REAL NOT NULL,
    "shortPrice" REAL,
    "combinedPnlPct" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairDailySnapshot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "PairPosition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PairZScoreSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "formationId" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "zScore" REAL NOT NULL,
    "spread" REAL NOT NULL,
    "hasSignal" BOOLEAN NOT NULL,
    "signalDirection" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PairFormation_ticker1_ticker2_formationStart_key" ON "PairFormation"("ticker1", "ticker2", "formationStart");
CREATE INDEX IF NOT EXISTS "PairFormation_active_idx" ON "PairFormation"("active");
CREATE INDEX IF NOT EXISTS "PairFormation_ticker1_ticker2_idx" ON "PairFormation"("ticker1", "ticker2");
CREATE INDEX IF NOT EXISTS "PairPosition_status_idx" ON "PairPosition"("status");
CREATE INDEX IF NOT EXISTS "PairPosition_formationId_idx" ON "PairPosition"("formationId");
CREATE INDEX IF NOT EXISTS "PairDailySnapshot_positionId_idx" ON "PairDailySnapshot"("positionId");
CREATE INDEX IF NOT EXISTS "PairDailySnapshot_date_idx" ON "PairDailySnapshot"("date");
CREATE INDEX IF NOT EXISTS "PairZScoreSnapshot_formationId_idx" ON "PairZScoreSnapshot"("formationId");
CREATE INDEX IF NOT EXISTS "PairZScoreSnapshot_date_idx" ON "PairZScoreSnapshot"("date");
