// ============================================================
// Pairs Formation — Weekly Formation Period Runner
// ============================================================
//
// Fetches 12 months of daily closes, runs statistics on all
// candidate pairs (seed + algorithmic), filters, ranks, and
// stores top 20 active formations.
// ============================================================

import 'server-only';
import { getDailyPrices } from '@/lib/market-data';
import prisma from '@/lib/prisma';
import { getSeedPairs, isSeedPair } from './pairs-universe';
import {
  calculateSSD,
  calculateSpread,
  calculateSpreadStats,
  calculateHalfLife,
  calculateCorrelation,
  isCointegrated,
  HALF_LIFE_MIN,
  HALF_LIFE_MAX,
} from './pairs-statistics';

const PREFIX = '[PAIRS-FORMATION]';
const MAX_ACTIVE_PAIRS = 20;
const MIN_OVERLAPPING_DAYS = 200;
const BATCH_DELAY_MS = 200;

export interface PairFormationResult {
  ticker1: string;
  ticker2: string;
  market: 'LSE' | 'US' | 'MIXED';
  isSeedPair: boolean;
  sector: string;
  formationStart: Date;
  formationEnd: Date;
  ssd: number;
  correlation: number;
  halfLife: number;
  spreadMean: number;
  spreadStd: number;
  cointegrationPValue: number;
  isCointegrated: boolean;
  active: boolean;
  deactivatedReason?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function detectMarket(ticker: string): 'LSE' | 'US' {
  return ticker.endsWith('.L') ? 'LSE' : 'US';
}

/**
 * Fetch 12 months of daily closing prices for a ticker.
 */
async function fetchCloses(ticker: string): Promise<{ date: string; close: number }[]> {
  try {
    const bars = await getDailyPrices(ticker, 'full');
    return bars.map((b) => ({ date: b.date, close: b.close }));
  } catch {
    console.warn(`${PREFIX} Failed to fetch prices for ${ticker}`);
    return [];
  }
}

/**
 * Align two price series by date (inner join).
 */
function alignSeries(
  s1: { date: string; close: number }[],
  s2: { date: string; close: number }[]
): { closes1: number[]; closes2: number[] } {
  const map2 = new Map(s2.map((d) => [d.date, d.close]));
  const closes1: number[] = [];
  const closes2: number[] = [];

  // s1 is sorted newest-first from getDailyPrices — reverse for chronological
  const sorted1 = [...s1].reverse();
  for (const bar of sorted1) {
    const c2 = map2.get(bar.date);
    if (c2 != null) {
      closes1.push(bar.close);
      closes2.push(c2);
    }
  }
  return { closes1, closes2 };
}

/**
 * Run weekly formation: evaluate all candidate pairs, filter, rank, persist.
 */
export async function runWeeklyFormation(): Promise<PairFormationResult[]> {
  const seeds = getSeedPairs();
  const now = new Date();
  const formationStart = new Date(now);
  formationStart.setFullYear(formationStart.getFullYear() - 1);

  // Collect all unique tickers from seed pairs
  const tickerSet = new Set<string>();
  for (const s of seeds) {
    tickerSet.add(s.ticker1);
    tickerSet.add(s.ticker2);
  }

  // Fetch price data with rate limiting
  const priceCache = new Map<string, { date: string; close: number }[]>();
  const tickers = Array.from(tickerSet);
  for (let i = 0; i < tickers.length; i++) {
    if (i > 0) await delay(BATCH_DELAY_MS);
    const data = await fetchCloses(tickers[i]);
    priceCache.set(tickers[i], data);
  }

  // Evaluate each candidate pair
  const results: PairFormationResult[] = [];
  let totalCandidates = 0;
  let passedFilters = 0;

  // Process seed pairs first, then could add algorithmic discovery later
  const candidatePairs: { ticker1: string; ticker2: string; sector: string; seed: boolean }[] = [];
  for (const s of seeds) {
    candidatePairs.push({ ticker1: s.ticker1, ticker2: s.ticker2, sector: s.sector, seed: true });
  }
  totalCandidates = candidatePairs.length;

  for (const pair of candidatePairs) {
    const data1 = priceCache.get(pair.ticker1);
    const data2 = priceCache.get(pair.ticker2);
    if (!data1?.length || !data2?.length) continue;

    const { closes1, closes2 } = alignSeries(data1, data2);
    if (closes1.length < MIN_OVERLAPPING_DAYS) continue;

    // Run statistics
    const ssd = calculateSSD(closes1, closes2);
    const spread = calculateSpread(closes1, closes2);
    const spreadStats = calculateSpreadStats(spread);
    const halfLife = calculateHalfLife(spread);
    const corr = calculateCorrelation(closes1, closes2);
    const cointThreshold = pair.seed ? 0.05 : 0.10;
    const coint = isCointegrated(closes1, closes2, cointThreshold);

    // Apply filters
    if (halfLife < HALF_LIFE_MIN || halfLife > HALF_LIFE_MAX) continue;
    if (corr < 0.7) continue;
    if (coint.pValue > 0.10) continue;

    passedFilters++;

    const m1 = detectMarket(pair.ticker1);
    const m2 = detectMarket(pair.ticker2);
    const market = m1 === m2 ? m1 : 'MIXED';

    results.push({
      ticker1: pair.ticker1,
      ticker2: pair.ticker2,
      market,
      isSeedPair: pair.seed,
      sector: pair.sector,
      formationStart,
      formationEnd: now,
      ssd,
      correlation: corr,
      halfLife,
      spreadMean: spreadStats.mean,
      spreadStd: spreadStats.std,
      cointegrationPValue: coint.pValue,
      isCointegrated: coint.isCointegrated,
      active: true,
    });
  }

  // Rank by: seed first, then half-life proximity to 15, then lowest SSD
  results.sort((a, b) => {
    if (a.isSeedPair !== b.isSeedPair) return a.isSeedPair ? -1 : 1;
    const halfA = Math.abs(a.halfLife - 15);
    const halfB = Math.abs(b.halfLife - 15);
    if (halfA !== halfB) return halfA - halfB;
    return a.ssd - b.ssd;
  });

  // Keep top MAX_ACTIVE_PAIRS
  const selected = results.slice(0, MAX_ACTIVE_PAIRS);

  // Deactivate previous formations
  await prisma.pairFormation.updateMany({
    where: { active: true },
    data: { active: false, deactivatedAt: now, deactivatedReason: 'new-formation-period' },
  });

  // Persist new formations
  for (const r of selected) {
    try {
      await prisma.pairFormation.create({
        data: {
          ticker1: r.ticker1,
          ticker2: r.ticker2,
          market: r.market,
          isSeedPair: r.isSeedPair,
          sector: r.sector,
          formationStart: r.formationStart,
          formationEnd: r.formationEnd,
          ssd: r.ssd,
          correlation: r.correlation,
          halfLife: r.halfLife,
          spreadMean: r.spreadMean,
          spreadStd: r.spreadStd,
          cointegrationPValue: r.cointegrationPValue,
          isCointegrated: r.isCointegrated,
          active: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} DB write failed for ${r.ticker1}/${r.ticker2}: ${msg}`);
    }
  }

  console.log(
    `${PREFIX} ${totalCandidates} candidates → ${passedFilters} passed filters → ${selected.length} selected as active`
  );

  return selected;
}

/**
 * Get currently active pair formations.
 */
export async function getActivePairs(): Promise<PairFormationResult[]> {
  const rows = await prisma.pairFormation.findMany({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((r) => ({
    ticker1: r.ticker1,
    ticker2: r.ticker2,
    market: r.market as PairFormationResult['market'],
    isSeedPair: r.isSeedPair,
    sector: r.sector,
    formationStart: r.formationStart,
    formationEnd: r.formationEnd,
    ssd: r.ssd,
    correlation: r.correlation,
    halfLife: r.halfLife,
    spreadMean: r.spreadMean,
    spreadStd: r.spreadStd,
    cointegrationPValue: r.cointegrationPValue,
    isCointegrated: r.isCointegrated,
    active: r.active,
    deactivatedReason: r.deactivatedReason ?? undefined,
  }));
}

export async function getFormationData(
  ticker1: string,
  ticker2: string
): Promise<PairFormationResult | null> {
  const row = await prisma.pairFormation.findFirst({
    where: { ticker1, ticker2, active: true },
  });
  if (!row) return null;
  return {
    ticker1: row.ticker1,
    ticker2: row.ticker2,
    market: row.market as PairFormationResult['market'],
    isSeedPair: row.isSeedPair,
    sector: row.sector,
    formationStart: row.formationStart,
    formationEnd: row.formationEnd,
    ssd: row.ssd,
    correlation: row.correlation,
    halfLife: row.halfLife,
    spreadMean: row.spreadMean,
    spreadStd: row.spreadStd,
    cointegrationPValue: row.cointegrationPValue,
    isCointegrated: row.isCointegrated,
    active: row.active,
    deactivatedReason: row.deactivatedReason ?? undefined,
  };
}
