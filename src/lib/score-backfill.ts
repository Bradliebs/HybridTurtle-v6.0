/**
 * DEPENDENCIES
 * Consumed by: /api/analytics/score-validation/route.ts (POST backfill)
 * Consumes: prisma.ts, dual-score.ts
 * Risk-sensitive: NO — analytics only, backfills score data
 * Last modified: 2026-03-06
 * Notes: Populates bqs/fws/ncs/dualScoreAction on CandidateOutcome rows
 *        by matching to ScoreBreakdown data (ticker + scoredAt ≈ scanDate).
 *        Falls back to computing from ScoreBreakdown component totals.
 */
import prisma from './prisma';
import { normaliseRow, scoreRow } from './dual-score';

export interface ScoreBackfillSnapshotSource {
  ticker: string;
  name: string | null;
  sleeve: string | null;
  status: string | null;
  currency: string | null;
  close: number;
  atr14: number;
  atrPct: number;
  adx14: number;
  plusDi: number;
  minusDi: number;
  weeklyAdx: number;
  volRatio: number;
  marketRegime: string;
  marketRegimeStable: boolean;
  volRegime: string | null;
  dualRegimeAligned: boolean;
  distanceTo20dHighPct: number;
  entryTrigger: number;
  stopLevel: number;
  chasing20Last5: boolean;
  chasing55Last5: boolean;
  atrSpiking: boolean;
  atrCollapsing: boolean;
  rsVsBenchmarkPct: number;
  daysToEarnings: number | null;
  earningsInNext5d: boolean;
  clusterName: string | null;
  superClusterName: string | null;
  clusterExposurePct: number;
  superClusterExposurePct: number;
  maxClusterPct: number;
  maxSuperClusterPct: number;
  bisScore: number;
  createdAt: Date;
}

interface BackfilledScoreValues {
  bqs: number;
  fws: number;
  ncs: number;
  dualScoreAction: string;
}

export interface ScoreBackfillResult {
  updated: number;
  skipped: number;
  errors: number;
  batches: number;
}

function selectClosestByDate<T>(
  rows: T[],
  targetDate: Date,
  getDate: (row: T) => Date
): T | null {
  let bestRow: T | null = null;
  let bestDiffMs = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const diffMs = Math.abs(getDate(row).getTime() - targetDate.getTime());
    if (diffMs < bestDiffMs) {
      bestDiffMs = diffMs;
      bestRow = row;
    }
  }

  return bestRow;
}

export function deriveScoresFromSnapshotTicker(
  snapshot: ScoreBackfillSnapshotSource
): BackfilledScoreValues {
  const scored = scoreRow(normaliseRow({
    ticker: snapshot.ticker,
    name: snapshot.name || snapshot.ticker,
    sleeve: snapshot.sleeve || 'CORE',
    status: snapshot.status || 'FAR',
    currency: snapshot.currency || undefined,
    close: snapshot.close,
    atr_14: snapshot.atr14,
    atr_pct: snapshot.atrPct,
    adx_14: snapshot.adx14,
    plus_di: snapshot.plusDi,
    minus_di: snapshot.minusDi,
    vol_ratio: snapshot.volRatio,
    market_regime: snapshot.marketRegime,
    market_regime_stable: snapshot.marketRegimeStable,
    distance_to_20d_high_pct: snapshot.distanceTo20dHighPct,
    entry_trigger: snapshot.entryTrigger,
    stop_level: snapshot.stopLevel,
    chasing_20_last5: snapshot.chasing20Last5,
    chasing_55_last5: snapshot.chasing55Last5,
    atr_spiking: snapshot.atrSpiking,
    atr_collapsing: snapshot.atrCollapsing,
    rs_vs_benchmark_pct: snapshot.rsVsBenchmarkPct,
    days_to_earnings: snapshot.daysToEarnings,
    earnings_in_next_5d: snapshot.earningsInNext5d,
    cluster_name: snapshot.clusterName || undefined,
    super_cluster_name: snapshot.superClusterName || undefined,
    cluster_exposure_pct: snapshot.clusterExposurePct,
    super_cluster_exposure_pct: snapshot.superClusterExposurePct,
    max_cluster_pct: snapshot.maxClusterPct,
    max_super_cluster_pct: snapshot.maxSuperClusterPct,
    weekly_adx: snapshot.weeklyAdx,
    vol_regime: snapshot.volRegime || 'NORMAL_VOL',
    dual_regime_aligned: snapshot.dualRegimeAligned,
    bis_score: snapshot.bisScore,
  }));

  return {
    bqs: scored.BQS,
    fws: scored.FWS,
    ncs: scored.NCS,
    dualScoreAction: classifyDualScoreAction(scored.FWS, scored.NCS),
  };
}

/**
 * Derive actionNote classification from FWS and NCS values.
 * Mirrors dual-score.ts actionNote() logic exactly:
 *  - FWS > 65 → 'Auto-No (fragile)'
 *  - NCS >= 70 AND FWS <= 30 → 'Auto-Yes'
 *  - Otherwise → 'Conditional'
 */
export function classifyDualScoreAction(fws: number, ncs: number): string {
  if (fws > 65) return 'Auto-No';
  if (ncs >= 70 && fws <= 30) return 'Auto-Yes';
  return 'Conditional';
}

export async function backfillScoresOnOutcomesBatch(
  limit = 500
): Promise<Omit<ScoreBackfillResult, 'batches'>> {
  const outcomes = await prisma.candidateOutcome.findMany({
    where: { bqs: null },
    orderBy: { scanDate: 'desc' },
    select: {
      id: true,
      ticker: true,
      scanDate: true,
    },
    take: limit,
  });

  if (outcomes.length === 0) return { updated: 0, skipped: 0, errors: 0 };

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const outcome of outcomes) {
    const startDate = new Date(outcome.scanDate);
    startDate.setDate(startDate.getDate() - 2);
    const endDate = new Date(outcome.scanDate);
    endDate.setDate(endDate.getDate() + 2);

    try {
      const scoreRows = await prisma.scoreBreakdown.findMany({
        where: {
          ticker: outcome.ticker,
          scoredAt: { gte: startDate, lte: endDate },
        },
        orderBy: { scoredAt: 'asc' },
        select: {
          scoredAt: true,
          bqsTotal: true,
          fwsTotal: true,
          ncsTotal: true,
          actionNote: true,
        },
      });

      const nearestScoreRow = selectClosestByDate(scoreRows, outcome.scanDate, (row) => row.scoredAt);

      let values: BackfilledScoreValues | null = null;
      if (nearestScoreRow) {
        values = {
          bqs: nearestScoreRow.bqsTotal,
          fws: nearestScoreRow.fwsTotal,
          ncs: nearestScoreRow.ncsTotal,
          dualScoreAction: classifyDualScoreAction(nearestScoreRow.fwsTotal, nearestScoreRow.ncsTotal),
        };
      } else {
        const snapshots = await prisma.snapshotTicker.findMany({
          where: {
            ticker: outcome.ticker,
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            ticker: true,
            name: true,
            sleeve: true,
            status: true,
            currency: true,
            close: true,
            atr14: true,
            atrPct: true,
            adx14: true,
            plusDi: true,
            minusDi: true,
            weeklyAdx: true,
            volRatio: true,
            marketRegime: true,
            marketRegimeStable: true,
            volRegime: true,
            dualRegimeAligned: true,
            distanceTo20dHighPct: true,
            entryTrigger: true,
            stopLevel: true,
            chasing20Last5: true,
            chasing55Last5: true,
            atrSpiking: true,
            atrCollapsing: true,
            rsVsBenchmarkPct: true,
            daysToEarnings: true,
            earningsInNext5d: true,
            clusterName: true,
            superClusterName: true,
            clusterExposurePct: true,
            superClusterExposurePct: true,
            maxClusterPct: true,
            maxSuperClusterPct: true,
            bisScore: true,
            createdAt: true,
          },
        });

        const nearestSnapshot = selectClosestByDate(snapshots, outcome.scanDate, (row) => row.createdAt);
        if (nearestSnapshot) {
          values = deriveScoresFromSnapshotTicker(nearestSnapshot);
        }
      }

      if (!values) {
        skipped++;
        continue;
      }

      await prisma.candidateOutcome.update({
        where: { id: outcome.id },
        data: {
          bqs: values.bqs,
          fws: values.fws,
          ncs: values.ncs,
          dualScoreAction: values.dualScoreAction,
        },
      });
      updated++;
    } catch (e) {
      console.error(`[ScoreBackfill] Failed for ${outcome.ticker}:`, e);
      errors++;
    }
  }

  return { updated, skipped, errors };
}

/**
 * Backfill BQS/FWS/NCS/dualScoreAction on CandidateOutcome rows
 * by joining to ScoreBreakdown data (ticker + date match).
 *
 * Only processes rows where bqs IS NULL (not yet populated).
 *
 * @returns count of rows updated
 */
export async function backfillScoresOnOutcomes(opts?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<ScoreBackfillResult> {
  const batchSize = opts?.batchSize ?? 500;
  const maxBatches = opts?.maxBatches ?? 100;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let batches = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    const result = await backfillScoresOnOutcomesBatch(batchSize);
    if (result.updated === 0 && result.skipped === 0 && result.errors === 0) break;

    updated += result.updated;
    skipped += result.skipped;
    errors += result.errors;
    batches++;

    if (result.updated + result.skipped + result.errors < batchSize) break;
  }

  return { updated, skipped, errors, batches };
}
