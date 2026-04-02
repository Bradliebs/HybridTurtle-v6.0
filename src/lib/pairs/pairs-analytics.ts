// ============================================================
// Pairs Analytics — Performance Tracking
// ============================================================

import 'server-only';
import prisma from '@/lib/prisma';

export interface PairsPerformanceSummary {
  totalClosed: number;
  winRate: number;
  avgReturnPct: number;
  avgConvergenceDays: number;
  bySeedStatus: Record<string, { count: number; winRate: number; avgPnl: number }>;
  byMarket: Record<string, { count: number; winRate: number; avgPnl: number }>;
}

export interface CrowdingRiskResult {
  isCrowded: boolean;
  crowdedSectors: string[];
  activePositionCount: number;
}

export interface PairTradeHistory {
  openDate: Date;
  closeDate: Date | null;
  tradingDaysHeld: number;
  combinedPnlPct: number | null;
  closeReason: string | null;
}

/**
 * Aggregate performance for the pairs module.
 */
export async function getPairsPerformanceSummary(
  lookbackDays?: number
): Promise<PairsPerformanceSummary> {
  const where: Record<string, unknown> = { status: 'closed' };
  if (lookbackDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    where.closeDate = { gte: cutoff };
  }

  const closed = await prisma.pairPosition.findMany({
    where: where as Parameters<typeof prisma.pairPosition.findMany>[0]['where'],
    include: { formation: true },
  });

  if (closed.length === 0) {
    return { totalClosed: 0, winRate: 0, avgReturnPct: 0, avgConvergenceDays: 0, bySeedStatus: {}, byMarket: {} };
  }

  const wins = closed.filter((p) => (p.combinedPnlPct ?? 0) > 0);
  const avgPnl = closed.reduce((s, p) => s + (p.combinedPnlPct ?? 0), 0) / closed.length;
  const avgDays = closed.reduce((s, p) => s + p.tradingDaysHeld, 0) / closed.length;

  // By seed status
  const bySeed: Record<string, typeof closed> = { seed: [], algorithmic: [] };
  for (const p of closed) {
    const key = p.formation.isSeedPair ? 'seed' : 'algorithmic';
    bySeed[key].push(p);
  }

  const bySeedStatus: PairsPerformanceSummary['bySeedStatus'] = {};
  for (const [key, group] of Object.entries(bySeed)) {
    if (group.length === 0) continue;
    const gWins = group.filter((p) => (p.combinedPnlPct ?? 0) > 0).length;
    bySeedStatus[key] = {
      count: group.length,
      winRate: Math.round((gWins / group.length) * 100),
      avgPnl: Math.round(group.reduce((s, p) => s + (p.combinedPnlPct ?? 0), 0) / group.length * 10) / 10,
    };
  }

  // By market
  const byMkt: Record<string, typeof closed> = {};
  for (const p of closed) {
    const m = p.formation.market;
    if (!byMkt[m]) byMkt[m] = [];
    byMkt[m].push(p);
  }

  const byMarket: PairsPerformanceSummary['byMarket'] = {};
  for (const [key, group] of Object.entries(byMkt)) {
    const gWins = group.filter((p) => (p.combinedPnlPct ?? 0) > 0).length;
    byMarket[key] = {
      count: group.length,
      winRate: Math.round((gWins / group.length) * 100),
      avgPnl: Math.round(group.reduce((s, p) => s + (p.combinedPnlPct ?? 0), 0) / group.length * 10) / 10,
    };
  }

  return {
    totalClosed: closed.length,
    winRate: Math.round((wins.length / closed.length) * 100),
    avgReturnPct: Math.round(avgPnl * 10) / 10,
    avgConvergenceDays: Math.round(avgDays),
    bySeedStatus,
    byMarket,
  };
}

/**
 * Check for sector crowding across active pairs positions.
 */
export async function getCrowdingRiskWarning(): Promise<CrowdingRiskResult> {
  const active = await prisma.pairPosition.findMany({
    where: { status: 'active' },
    include: { formation: true },
  });

  const sectorCount = new Map<string, number>();
  for (const p of active) {
    const sec = p.formation.sector;
    sectorCount.set(sec, (sectorCount.get(sec) ?? 0) + 1);
  }

  const crowdedSectors = Array.from(sectorCount.entries())
    .filter(([, count]) => count >= 5)
    .map(([sec]) => sec);

  return {
    isCrowded: crowdedSectors.length > 0,
    crowdedSectors,
    activePositionCount: active.length,
  };
}

/**
 * Get trade history for a specific pair.
 */
export async function getPairHistory(
  ticker1: string,
  ticker2: string
): Promise<PairTradeHistory[]> {
  const positions = await prisma.pairPosition.findMany({
    where: {
      formation: { ticker1, ticker2 },
      status: 'closed',
    },
    orderBy: { closeDate: 'desc' },
  });

  return positions.map((p) => ({
    openDate: p.openDate,
    closeDate: p.closeDate,
    tradingDaysHeld: p.tradingDaysHeld,
    combinedPnlPct: p.combinedPnlPct,
    closeReason: p.closeReason,
  }));
}
