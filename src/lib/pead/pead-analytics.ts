// ============================================================
// PEAD Analytics — Performance Tracking
// ============================================================
//
// Evaluates whether the PEAD module is adding alpha,
// independently of the main momentum system.
// ============================================================

import 'server-only';
import prisma from '@/lib/prisma';

const PREFIX = '[PEAD-ANALYTICS]';

// ── Types ──

export interface PeadPerformanceSummary {
  totalClosed: number;
  winRate: number;
  avgPnlPct: number;
  avgHoldingDaysWin: number;
  avgHoldingDaysLoss: number;
  bySignalStrength: Record<string, { count: number; winRate: number; avgPnl: number }>;
  crossConfirmedWinRate: number;
  nonCrossWinRate: number;
  usWinRate: number;
  lseWinRate: number;
}

export interface DriftByDay {
  tradingDay: number;
  avgDriftPct: number;
  sampleSize: number;
}

/**
 * Get aggregate PEAD performance metrics.
 * @param lookbackDays - only include positions closed in the last N days (default: all)
 */
export async function getPeadPerformanceSummary(
  lookbackDays?: number
): Promise<PeadPerformanceSummary> {
  const where: Record<string, unknown> = { status: 'closed' };
  if (lookbackDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    where.closeDate = { gte: cutoff };
  }

  const closed = await prisma.peadPosition.findMany({
    where: where as Parameters<typeof prisma.peadPosition.findMany>[0]['where'],
    include: { candidate: true },
  });

  if (closed.length === 0) {
    return {
      totalClosed: 0,
      winRate: 0,
      avgPnlPct: 0,
      avgHoldingDaysWin: 0,
      avgHoldingDaysLoss: 0,
      bySignalStrength: {},
      crossConfirmedWinRate: 0,
      nonCrossWinRate: 0,
      usWinRate: 0,
      lseWinRate: 0,
    };
  }

  const wins = closed.filter((p) => (p.pnlPct ?? 0) > 0);
  const losses = closed.filter((p) => (p.pnlPct ?? 0) <= 0);

  const avgPnl = closed.reduce((sum, p) => sum + (p.pnlPct ?? 0), 0) / closed.length;

  const avgHoldWin = wins.length > 0
    ? wins.reduce((sum, p) => sum + p.tradingDaysHeld, 0) / wins.length
    : 0;
  const avgHoldLoss = losses.length > 0
    ? losses.reduce((sum, p) => sum + p.tradingDaysHeld, 0) / losses.length
    : 0;

  // By signal strength
  const byStrength: Record<string, { count: number; winRate: number; avgPnl: number }> = {};
  const strengthGroups = new Map<string, typeof closed>();
  for (const p of closed) {
    const s = p.candidate.signalStrength;
    if (!strengthGroups.has(s)) strengthGroups.set(s, []);
    strengthGroups.get(s)!.push(p);
  }
  for (const [strength, group] of strengthGroups) {
    const groupWins = group.filter((p) => (p.pnlPct ?? 0) > 0).length;
    const groupAvgPnl = group.reduce((sum, p) => sum + (p.pnlPct ?? 0), 0) / group.length;
    byStrength[strength] = {
      count: group.length,
      winRate: Math.round((groupWins / group.length) * 100),
      avgPnl: Math.round(groupAvgPnl * 10) / 10,
    };
  }

  // Cross-confirmed vs not
  const cross = closed.filter((p) => p.candidate.crossConfirmed);
  const nonCross = closed.filter((p) => !p.candidate.crossConfirmed);
  const crossWinRate = cross.length > 0
    ? Math.round((cross.filter((p) => (p.pnlPct ?? 0) > 0).length / cross.length) * 100)
    : 0;
  const nonCrossWinRate = nonCross.length > 0
    ? Math.round((nonCross.filter((p) => (p.pnlPct ?? 0) > 0).length / nonCross.length) * 100)
    : 0;

  // US vs LSE
  const us = closed.filter((p) => p.candidate.market === 'US');
  const lse = closed.filter((p) => p.candidate.market === 'LSE');
  const usWinRate = us.length > 0
    ? Math.round((us.filter((p) => (p.pnlPct ?? 0) > 0).length / us.length) * 100)
    : 0;
  const lseWinRate = lse.length > 0
    ? Math.round((lse.filter((p) => (p.pnlPct ?? 0) > 0).length / lse.length) * 100)
    : 0;

  return {
    totalClosed: closed.length,
    winRate: Math.round((wins.length / closed.length) * 100),
    avgPnlPct: Math.round(avgPnl * 10) / 10,
    avgHoldingDaysWin: Math.round(avgHoldWin),
    avgHoldingDaysLoss: Math.round(avgHoldLoss),
    bySignalStrength: byStrength,
    crossConfirmedWinRate: crossWinRate,
    nonCrossWinRate,
    usWinRate,
    lseWinRate,
  };
}

/**
 * Get average drift by trading day across all snapshots.
 * Returns data points at days 1, 5, 10, 20, 40, 60.
 */
export async function getPeadDriftCurve(): Promise<DriftByDay[]> {
  const targetDays = [1, 5, 10, 20, 40, 60];
  const results: DriftByDay[] = [];

  for (const day of targetDays) {
    const snapshots = await prisma.peadDailySnapshot.findMany({
      where: { tradingDay: day },
      select: { driftPct: true },
    });

    if (snapshots.length === 0) {
      results.push({ tradingDay: day, avgDriftPct: 0, sampleSize: 0 });
    } else {
      const avg = snapshots.reduce((sum, s) => sum + s.driftPct, 0) / snapshots.length;
      results.push({
        tradingDay: day,
        avgDriftPct: Math.round(avg * 10) / 10,
        sampleSize: snapshots.length,
      });
    }
  }

  return results;
}
