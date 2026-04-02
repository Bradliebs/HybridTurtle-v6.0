-- CreateTable
CREATE TABLE IF NOT EXISTS "SeasonalSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "season" TEXT NOT NULL,
    "seasonalRiskOff" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SeasonalSnapshot_date_idx" ON "SeasonalSnapshot"("date");
