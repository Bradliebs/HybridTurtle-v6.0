export const dynamic = 'force-dynamic';

/**
 * DEPENDENCIES
 * Consumed by: /breakout-evidence page, research tooling
 * Consumes: prisma.ts (SnapshotTicker, CandidateOutcome)
 * Risk-sensitive: NO — read-only analytics, Layer 2 advisory
 * Last modified: 2026-03-11
 * Notes: Aggregates breakout evidence from SnapshotTicker + forward outcomes
 *        from CandidateOutcome. All data is observational — never affects
 *        scan decisions or risk gates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import prisma from '@/lib/prisma';
import {
  computeBucketStats,
  getOutcomeQueryRange,
  matchOutcomesToSnapshots,
} from '@/lib/analytics/breakout-evidence';

// ── Types ──────────────────────────────────────────────────────────

// ── GET handler ────────────────────────────────────────────────────

const breakoutEvidenceQuerySchema = z.object({
  sleeve: z.string().max(30).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  limit: z.string().default('2000').transform(Number).pipe(z.number().int().min(1).max(5000)),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, breakoutEvidenceQuerySchema);
  if (!qv.ok) return qv.response;

  const { sleeve, from, to, limit } = qv.data;

  // 1. Fetch recent SnapshotTicker rows that have breakout evidence fields
  const snapshotWhere: Record<string, unknown> = {
    novelSignalVersion: { not: null },
  };
  if (sleeve) snapshotWhere.sleeve = sleeve;
  if (from || to) {
    snapshotWhere.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const snapshots = await prisma.snapshotTicker.findMany({
    where: snapshotWhere,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      ticker: true,
      sleeve: true,
      status: true,
      close: true,
      isBreakout20: true,
      breakoutDistancePct: true,
      breakoutWindowDays: true,
      entropy63: true,
      netIsolation: true,
      entropyObsCount: true,
      netIsolationPeerCount: true,
      netIsolationObsCount: true,
      novelSignalVersion: true,
      smartMoney21: true,
      fractalDim: true,
      complexity: true,
      createdAt: true,
    },
  });

  // 2. Split into breakout vs non-breakout
  const breakoutSnaps = snapshots.filter((s) => s.isBreakout20 === true);
  const nonBreakoutSnaps = snapshots.filter((s) => s.isBreakout20 === false);

  // 3. Find matching CandidateOutcome records for forward return data.
  //    Match by ticker + nearby scan date to avoid blending unrelated history.
  const snapshotTickers = Array.from(new Set(snapshots.map((s) => s.ticker)));
  const outcomeRange = getOutcomeQueryRange(snapshots);

  const outcomes = snapshotTickers.length > 0 && outcomeRange
    ? await prisma.candidateOutcome.findMany({
        where: {
          ticker: { in: snapshotTickers },
          enrichedAt: { not: null },
          scanDate: outcomeRange,
        },
        select: {
          ticker: true,
          scanDate: true,
          fwdReturn5d: true,
          fwdReturn10d: true,
          fwdReturn20d: true,
          mfeR: true,
          maeR: true,
          reached1R: true,
          stopHit: true,
        },
      })
    : [];

  const matchedPairs = matchOutcomesToSnapshots(snapshots, outcomes);
  const breakoutMatchedPairs = matchedPairs.filter((pair) => pair.snapshot.isBreakout20 === true);
  const nonBreakoutMatchedPairs = matchedPairs.filter((pair) => pair.snapshot.isBreakout20 === false);

  // 4. Compute stats for each bucket
  const breakoutStats = computeBucketStats(
    breakoutSnaps,
    breakoutMatchedPairs.map((pair) => pair.outcome)
  );
  const nonBreakoutStats = computeBucketStats(
    nonBreakoutSnaps,
    nonBreakoutMatchedPairs.map((pair) => pair.outcome)
  );

  // 5. Shadow stats: breakout + low entropy (structured trend)
  const breakoutLowEntropy = breakoutSnaps.filter(
    (s) => s.entropy63 != null && s.entropy63 < 2.5
  );
  const breakoutLowEntropyKeys = new Set(
    breakoutLowEntropy.map((snapshot) => `${snapshot.ticker}:${snapshot.createdAt.toISOString()}`)
  );
  const breakoutLowEntropyStats = computeBucketStats(
    breakoutLowEntropy,
    breakoutMatchedPairs
      .filter((pair) => breakoutLowEntropyKeys.has(`${pair.snapshot.ticker}:${pair.snapshot.createdAt.toISOString()}`))
      .map((pair) => pair.outcome)
  );

  // 6. Shadow stats: breakout + high isolation (independent mover)
  const breakoutHighIsolation = breakoutSnaps.filter(
    (s) => s.netIsolation != null && s.netIsolation > 0.5
  );
  const breakoutHighIsolationKeys = new Set(
    breakoutHighIsolation.map((snapshot) => `${snapshot.ticker}:${snapshot.createdAt.toISOString()}`)
  );
  const breakoutHighIsolationStats = computeBucketStats(
    breakoutHighIsolation,
    breakoutMatchedPairs
      .filter((pair) => breakoutHighIsolationKeys.has(`${pair.snapshot.ticker}:${pair.snapshot.createdAt.toISOString()}`))
      .map((pair) => pair.outcome)
  );

  // 7. Per-ticker latest breakout snapshot (for the detail table)
  const latestByTicker = new Map<string, typeof snapshots[number]>();
  for (const snap of snapshots) {
    if (!latestByTicker.has(snap.ticker)) {
      latestByTicker.set(snap.ticker, snap);
    }
  }

  const tickerDetails = Array.from(latestByTicker.values())
    .filter((s) => s.isBreakout20 === true)
    .sort((a, b) => (a.breakoutDistancePct ?? 0) - (b.breakoutDistancePct ?? 0))
    .slice(0, 50);

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totalSnapshots: snapshots.length,
    breakout: breakoutStats,
    nonBreakout: nonBreakoutStats,
    shadow: {
      breakoutLowEntropy: breakoutLowEntropyStats,
      breakoutHighIsolation: breakoutHighIsolationStats,
    },
    tickerDetails,
  });
}
