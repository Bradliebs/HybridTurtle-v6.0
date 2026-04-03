const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  try {
    // Count users
    const users = await db.user.count();
    console.log("User: " + users);
    
    // Count other tables
    const tables = {
      "EquitySnapshot": db.equitySnapshot,
      "Heartbeat": db.heartbeat,
      "HealthCheck": db.healthCheck,
      "Position": db.position,
      "TradeLog": db.tradeLog,
      "Scan": db.scan,
      "ScanResult": db.scanResult,
      "Snapshot": db.snapshot,
      "SnapshotTicker": db.snapshotTicker,
      "RegimeHistory": db.regimeHistory,
      "CorrelationFlag": db.correlationFlag,
      "ScoreBreakdown": db.scoreBreakdown,
      "FilterAttribution": db.filterAttribution,
      "CandidateOutcome": db.candidateOutcome,
      "Stock": db.stock,
      "StopHistory": db.stopHistory,
      "TradeJournal": db.tradeJournal
    };
    
    for (const [name, model] of Object.entries(tables)) {
      try {
        const count = await model.count();
        console.log(name + ": " + count);
      } catch(e) {
        console.log(name + ": ERROR - " + e.message);
      }
    }
    
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await db.$disconnect();
  }
}

main();