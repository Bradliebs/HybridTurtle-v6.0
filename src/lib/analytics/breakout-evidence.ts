export interface BreakoutEvidenceSnapshot {
  ticker: string;
  createdAt: Date;
  entropy63: number | null;
  netIsolation: number | null;
}

export interface BreakoutEvidenceOutcome {
  ticker: string;
  scanDate: Date;
  fwdReturn5d: number | null;
  fwdReturn10d: number | null;
  fwdReturn20d: number | null;
  mfeR: number | null;
  maeR: number | null;
  reached1R: boolean | null;
  stopHit: boolean | null;
}

export interface BucketStats {
  count: number;
  withOutcomes: number;
  avgFwd5d: number | null;
  avgFwd10d: number | null;
  avgFwd20d: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
  hit1RRate: number | null;
  stopHitRate: number | null;
  avgEntropy63: number | null;
  avgNetIsolation: number | null;
}

export interface MatchedBreakoutEvidencePair<
  TSnapshot extends BreakoutEvidenceSnapshot = BreakoutEvidenceSnapshot,
  TOutcome extends BreakoutEvidenceOutcome = BreakoutEvidenceOutcome,
> {
  snapshot: TSnapshot;
  outcome: TOutcome;
  diffMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeBucketStats(
  snapshots: Pick<BreakoutEvidenceSnapshot, 'entropy63' | 'netIsolation'>[],
  outcomes: Pick<BreakoutEvidenceOutcome, 'fwdReturn5d' | 'fwdReturn10d' | 'fwdReturn20d' | 'mfeR' | 'maeR' | 'reached1R' | 'stopHit'>[]
): BucketStats {
  const count = snapshots.length;
  const withOutcomes = outcomes.length;

  const avg = (arr: (number | null)[]): number | null => {
    const valid = arr.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
  };

  const rate = (arr: (boolean | null)[]): number | null => {
    const valid = arr.filter((v): v is boolean => v != null);
    return valid.length > 0 ? (valid.filter(Boolean).length / valid.length) * 100 : null;
  };

  return {
    count,
    withOutcomes,
    avgFwd5d: avg(outcomes.map((outcome) => outcome.fwdReturn5d)),
    avgFwd10d: avg(outcomes.map((outcome) => outcome.fwdReturn10d)),
    avgFwd20d: avg(outcomes.map((outcome) => outcome.fwdReturn20d)),
    avgMfeR: avg(outcomes.map((outcome) => outcome.mfeR)),
    avgMaeR: avg(outcomes.map((outcome) => outcome.maeR)),
    hit1RRate: rate(outcomes.map((outcome) => outcome.reached1R)),
    stopHitRate: rate(outcomes.map((outcome) => outcome.stopHit)),
    avgEntropy63: avg(snapshots.map((snapshot) => snapshot.entropy63)),
    avgNetIsolation: avg(snapshots.map((snapshot) => snapshot.netIsolation)),
  };
}

export function matchOutcomesToSnapshots<
  TSnapshot extends BreakoutEvidenceSnapshot,
  TOutcome extends BreakoutEvidenceOutcome,
>(
  snapshots: TSnapshot[],
  outcomes: TOutcome[],
  maxDaysDiff = 2
): MatchedBreakoutEvidencePair<TSnapshot, TOutcome>[] {
  const maxDiffMs = maxDaysDiff * DAY_MS;
  const outcomesByTicker = new Map<string, TOutcome[]>();

  for (const outcome of outcomes) {
    const existing = outcomesByTicker.get(outcome.ticker) ?? [];
    existing.push(outcome);
    outcomesByTicker.set(outcome.ticker, existing);
  }

  for (const tickerOutcomes of Array.from(outcomesByTicker.values())) {
    tickerOutcomes.sort((left: TOutcome, right: TOutcome) => left.scanDate.getTime() - right.scanDate.getTime());
  }

  const snapshotsByTicker = new Map<string, TSnapshot[]>();
  for (const snapshot of snapshots) {
    const existing = snapshotsByTicker.get(snapshot.ticker) ?? [];
    existing.push(snapshot);
    snapshotsByTicker.set(snapshot.ticker, existing);
  }

  const matches: MatchedBreakoutEvidencePair<TSnapshot, TOutcome>[] = [];

  for (const [ticker, tickerSnapshots] of Array.from(snapshotsByTicker.entries())) {
    const tickerOutcomes = outcomesByTicker.get(ticker) ?? [];
    if (tickerOutcomes.length === 0) continue;

    tickerSnapshots.sort((left: TSnapshot, right: TSnapshot) => left.createdAt.getTime() - right.createdAt.getTime());
    const usedOutcomeIndexes = new Set<number>();

    for (const snapshot of tickerSnapshots) {
      let bestIndex = -1;
      let bestDiffMs = Number.POSITIVE_INFINITY;

      for (let index = 0; index < tickerOutcomes.length; index++) {
        if (usedOutcomeIndexes.has(index)) continue;

        const diffMs = Math.abs(
          tickerOutcomes[index].scanDate.getTime() - snapshot.createdAt.getTime()
        );

        if (diffMs > maxDiffMs) continue;
        if (diffMs < bestDiffMs) {
          bestDiffMs = diffMs;
          bestIndex = index;
        }
      }

      if (bestIndex >= 0) {
        usedOutcomeIndexes.add(bestIndex);
        matches.push({
          snapshot,
          outcome: tickerOutcomes[bestIndex],
          diffMs: bestDiffMs,
        });
      }
    }
  }

  return matches;
}

export function getOutcomeQueryRange(
  snapshots: Pick<BreakoutEvidenceSnapshot, 'createdAt'>[],
  maxDaysDiff = 2
): { gte: Date; lte: Date } | null {
  if (snapshots.length === 0) return null;

  let minCreatedAt = snapshots[0].createdAt.getTime();
  let maxCreatedAt = snapshots[0].createdAt.getTime();
  for (const snapshot of snapshots) {
    const createdAtMs = snapshot.createdAt.getTime();
    if (createdAtMs < minCreatedAt) minCreatedAt = createdAtMs;
    if (createdAtMs > maxCreatedAt) maxCreatedAt = createdAtMs;
  }

  const paddingMs = maxDaysDiff * DAY_MS;
  return {
    gte: new Date(minCreatedAt - paddingMs),
    lte: new Date(maxCreatedAt + paddingMs),
  };
}