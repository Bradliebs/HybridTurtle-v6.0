const Database = require('better-sqlite3');
const fs = require('fs');

if (!fs.existsSync('dev.db')) {
  console.log('ERROR: Database file dev.db does not exist!');
  process.exit(1);
}

const db = new Database('dev.db');

// Get all tables
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();

console.log('=== All tables in database (' + allTables.length + ' total) ===');
allTables.forEach(t => console.log('  ' + t.name));

// Now count the requested tables
const requestedTables = ['EquitySnapshot','Heartbeat','HealthCheck','Position','TradeLog','Scan','ScanResult','Snapshot','SnapshotTicker','RegimeHistory','CorrelationFlag','ScoreBreakdown','FilterAttribution','CandidateOutcome','Stock','User','StopHistory','TradeJournal'];

console.log('\n=== Row counts for requested tables ===');
requestedTables.forEach(t => {
  const found = allTables.find(row => row.name === t);
  if (!found) {
    console.log(t + ': TABLE NOT FOUND');
  } else {
    try {
      const r = db.prepare('SELECT COUNT(*) as c FROM "' + t + '"').get();
      console.log(t + ': ' + r.c);
    } catch(e) {
      console.log(t + ': ERROR - ' + e.message);
    }
  }
});

db.close();