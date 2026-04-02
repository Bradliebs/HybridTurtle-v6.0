-- CreateTable
CREATE TABLE IF NOT EXISTS "VixSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "vixClose" REAL NOT NULL,
    "regime" TEXT NOT NULL,
    "multiplier" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VixSnapshot_date_idx" ON "VixSnapshot"("date");
