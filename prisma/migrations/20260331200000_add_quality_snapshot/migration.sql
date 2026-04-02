-- CreateTable
CREATE TABLE IF NOT EXISTS "QualitySnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticker" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "roe" REAL,
    "debtToEquity" REAL,
    "revenueGrowth" REAL,
    "returnOnAssets" REAL,
    "isFinancialSector" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" INTEGER NOT NULL,
    "qualityTier" TEXT NOT NULL,
    "momentumScoreMultiplier" REAL NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "dataComplete" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "QualitySnapshot_ticker_fetchedAt_key" ON "QualitySnapshot"("ticker", "fetchedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualitySnapshot_ticker_idx" ON "QualitySnapshot"("ticker");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QualitySnapshot_expiresAt_idx" ON "QualitySnapshot"("expiresAt");
