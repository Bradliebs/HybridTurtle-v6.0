// ============================================================
// Pairs Scanner — Nightly Signal Detection
// ============================================================
//
// LONG-ONLY MODE: Only the long leg is traded.
// Monitors active pairs for z-score entry signals nightly.
// ============================================================

import 'server-only';
import { getStockQuote } from '@/lib/market-data';
import prisma from '@/lib/prisma';
import { getActivePairs } from './pairs-formation';
import {
  calculateSpread,
  getCurrentZScore,
  ENTRY_ZSCORE,
} from './pairs-statistics';

const PREFIX = '[PAIRS-SCANNER]';

export interface PairsSignal {
  formationId: number;
  ticker1: string;
  ticker2: string;
  market: string;
  isSeedPair: boolean;
  sector: string;
  longTicker: string;
  zScore: number;
  spread: number;
  spreadMean: number;
  spreadStd: number;
  halfLife: number;
  cointegrationPValue: number;
  positionType: 'long-only-relative-value';
}

export interface PairZScore {
  ticker1: string;
  ticker2: string;
  zScore: number;
  spread: number;
  hasSignal: boolean;
  signalDirection: string | null;
}

const COOLING_OFF_DAYS = 10;
const CONFIRMATION_DAYS = 2;

/**
 * Nightly pairs scanner — checks z-scores and generates signals.
 */
export async function runPairsScanner(): Promise<PairsSignal[]> {
  // Check VIX regime
  let regime = 'normal';
  try {
    const { getCombinedRiskGate } = await import('@/lib/combined-risk-gate');
    const gate = await getCombinedRiskGate();
    regime = gate.regime;
  } catch {
    console.warn(`${PREFIX} Could not check regime — proceeding with normal`);
  }

  if (regime === 'crisis') {
    console.log(`${PREFIX} Regime is crisis — suspending pairs scanner`);
    return [];
  }

  const activePairs = await getActivePairs();
  if (activePairs.length === 0) {
    console.log(`${PREFIX} No active pair formations — run weekly formation first`);
    return [];
  }

  // Get formation DB records for IDs
  const formations = await prisma.pairFormation.findMany({ where: { active: true } });
  const formationMap = new Map(formations.map((f) => [`${f.ticker1}/${f.ticker2}`, f]));

  const signals: PairsSignal[] = [];
  const zScores: PairZScore[] = [];

  for (const pair of activePairs) {
    try {
      const [quote1, quote2] = await Promise.all([
        getStockQuote(pair.ticker1),
        getStockQuote(pair.ticker2),
      ]);

      if (!quote1 || !quote2) continue;

      // Calculate current spread and z-score using formation params
      const currentSpread = (quote1.price / quote1.price) * 100 - (quote2.price / quote2.price) * 100;
      // Simplified: use prices directly normalised to formation baseline
      const rawSpread = quote1.price - quote2.price;
      const z = getCurrentZScore(rawSpread, pair.spreadMean, pair.spreadStd);

      const formation = formationMap.get(`${pair.ticker1}/${pair.ticker2}`);
      const formationId = formation?.id ?? 0;

      // Store z-score snapshot
      const hasSignal = Math.abs(z) >= ENTRY_ZSCORE;
      let signalDirection: string | null = null;
      if (z >= ENTRY_ZSCORE) signalDirection = 'long-ticker2';
      else if (z <= -ENTRY_ZSCORE) signalDirection = 'long-ticker1';

      zScores.push({
        ticker1: pair.ticker1,
        ticker2: pair.ticker2,
        zScore: z,
        spread: rawSpread,
        hasSignal,
        signalDirection,
      });

      // Persist z-score snapshot
      try {
        await prisma.pairZScoreSnapshot.create({
          data: {
            formationId,
            date: new Date(),
            zScore: z,
            spread: rawSpread,
            hasSignal,
            signalDirection,
          },
        });
      } catch {}

      if (!hasSignal) continue;

      // Check confirmation: need 2 consecutive days with signal
      const recentSnapshots = await prisma.pairZScoreSnapshot.findMany({
        where: { formationId, hasSignal: true },
        orderBy: { date: 'desc' },
        take: CONFIRMATION_DAYS,
      });
      if (recentSnapshots.length < CONFIRMATION_DAYS) continue;

      // Check no existing open position for this pair
      const existingOpen = await prisma.pairPosition.findFirst({
        where: { formationId, status: 'active' },
      });
      if (existingOpen) continue;

      // Check cooling-off period
      const recentClose = await prisma.pairPosition.findFirst({
        where: {
          formationId,
          status: 'closed',
          closeReason: 'stop-loss',
          closeDate: {
            gte: new Date(Date.now() - COOLING_OFF_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      });
      if (recentClose) continue;

      // Long-only: determine which ticker to go long
      const longTicker = z >= ENTRY_ZSCORE ? pair.ticker2 : pair.ticker1;

      signals.push({
        formationId,
        ticker1: pair.ticker1,
        ticker2: pair.ticker2,
        market: pair.market,
        isSeedPair: pair.isSeedPair,
        sector: pair.sector,
        longTicker,
        zScore: z,
        spread: rawSpread,
        spreadMean: pair.spreadMean,
        spreadStd: pair.spreadStd,
        halfLife: pair.halfLife,
        cointegrationPValue: pair.cointegrationPValue,
        positionType: 'long-only-relative-value',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} Error processing ${pair.ticker1}/${pair.ticker2}: ${msg}`);
    }
  }

  // Summary log
  const signalDetails = signals
    .map((s) => `${s.ticker1}/${s.ticker2} zScore: ${s.zScore >= 0 ? '+' : ''}${s.zScore.toFixed(1)}`)
    .join(', ');
  console.log(
    `${PREFIX} ${activePairs.length} active pairs monitored — ${signals.length} new signals${signals.length > 0 ? ` (${signalDetails})` : ''}`
  );

  return signals;
}

/**
 * Get current z-scores for all active pairs.
 */
export async function getCurrentZScores(): Promise<PairZScore[]> {
  const latest = await prisma.pairZScoreSnapshot.findMany({
    orderBy: { date: 'desc' },
    distinct: ['formationId'],
    include: {}, // just get the latest per formation
  });

  // Enrich with ticker names from formations
  const formations = await prisma.pairFormation.findMany({ where: { active: true } });
  const fMap = new Map(formations.map((f) => [f.id, f]));

  return latest
    .filter((s) => fMap.has(s.formationId))
    .map((s) => {
      const f = fMap.get(s.formationId)!;
      return {
        ticker1: f.ticker1,
        ticker2: f.ticker2,
        zScore: s.zScore,
        spread: s.spread,
        hasSignal: s.hasSignal,
        signalDirection: s.signalDirection,
      };
    });
}
