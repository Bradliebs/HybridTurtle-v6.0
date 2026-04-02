import fs from "fs";
import path from "path";
import Papa from "papaparse";

const ALLOWED_SECTORS = [
  "Technology",
  "Biotech",
  "Healthcare",
  "Energy",
  "Financial Services",
  "Consumer Discretionary",
  "Industrials",
  "Real Estate",
];

const csvPath = path.resolve(__dirname, "..", "data", "universe.csv");
const raw = fs.readFileSync(csvPath, "utf-8");

const { data, errors } = Papa.parse<{
  ticker: string;
  name: string;
  sector: string;
  market_cap: string;
}>(raw, { header: true, skipEmptyLines: true });

if (errors.length) {
  console.error("CSV parse errors:", errors);
}

let issues = 0;

// Check for duplicate tickers
const seen = new Map<string, number>();
for (const row of data) {
  const t = row.ticker;
  seen.set(t, (seen.get(t) ?? 0) + 1);
}
for (const [ticker, count] of seen) {
  if (count > 1) {
    console.error(`DUPLICATE: ${ticker} appears ${count} times`);
    issues++;
  }
}

// Check sector values
const sectorsFound = new Set<string>();
for (const row of data) {
  sectorsFound.add(row.sector);
  if (!ALLOWED_SECTORS.includes(row.sector)) {
    console.error(`BAD SECTOR: "${row.sector}" on ticker ${row.ticker}`);
    issues++;
  }
}

console.log(
  `${data.length} tickers, ${sectorsFound.size} sectors, ${issues} issues found`
);

process.exit(issues > 0 ? 1 : 0);
