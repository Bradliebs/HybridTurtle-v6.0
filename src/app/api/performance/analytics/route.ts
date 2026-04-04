export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ensureDefaultUser } from '@/lib/default-user';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';

/**
 * DEPENDENCIES
 * Consumed by: /performance page (PerformanceAnalytics components)
 * Consumes: prisma.ts, api-response.ts, default-user.ts, request-validation.ts
 * Risk-sensitive: NO — read-only, no DB writes
 * Last modified: 2026-04-04
 * Notes: Unified performance analytics endpoint. Returns period stats,
 *        equity curve, R-multiple by month, trade lists, and monthly stats.
 */

// ── Types ────────────────────────────────────────────────────

interface PeriodStats {
  totalR: number;
  totalPctGain: number;
  totalPnlGbp: number;
  winRate: number;
  tradeCount: number;
  wins: number;
  losses: number;
  breakeven: number;
}

interface TradeRow {
  id: string;
  ticker: string;
  entryType: string;
  entryDate: string;
  exitDate: string | null;
  rMultiple: number | null;
  pctGain: number | null;
  pnlGbp: number | null;
  daysHeld: number | null;
  accountType: string | null;
}

interface MonthlyStatRow {
  year: number;
  month: number;
  totalR: number;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
}

interface RMultipleMonthRow {
  month: string; // YYYY-MM
  avgR: number;
  totalR: number;
  tradeCount: number;
}

// ── Helpers ──────────────────────────────────────────────────

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function computePeriodStats(
  trades: Array<{ realisedPnlR: number | null; realisedPnlGbp: number | null; entryPrice: number; exitPrice: number | null; shares: number }>
): PeriodStats {
  let totalR = 0;
  let totalPnlGbp = 0;
  let totalInvested = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  for (const t of trades) {
    const r = t.realisedPnlR ?? 0;
    totalR += r;
    totalPnlGbp += t.realisedPnlGbp ?? 0;
    totalInvested += t.entryPrice * t.shares;

    if (r > 0.1) wins++;
    else if (r < -0.1) losses++;
    else breakeven++;
  }

  const tradeCount = trades.length;
  const winRate = tradeCount > 0 ? (wins / tradeCount) * 100 : 0;
  const totalPctGain = totalInvested > 0 ? (totalPnlGbp / totalInvested) * 100 : 0;

  return { totalR, totalPctGain, totalPnlGbp, winRate, tradeCount, wins, losses, breakeven };
}

// ── Route ────────────────────────────────────────────────────

const analyticsSchema = z.object({
  accountType: z.enum(['all', 'invest', 'isa']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, analyticsSchema);
    if (!qv.ok) return qv.response;

    const accountFilter = qv.data.accountType ?? 'all';
    const userId = await ensureDefaultUser();
    const now = new Date();

    // ── Fetch all closed positions ──
    const accountWhere = accountFilter !== 'all' ? { accountType: accountFilter } : {};

    const closedPositions = await prisma.position.findMany({
      where: { userId, status: 'CLOSED', ...accountWhere },
      include: { stock: { select: { ticker: true } } },
      orderBy: { exitDate: 'desc' },
    });

    const openPositions = await prisma.position.findMany({
      where: { userId, status: 'OPEN', ...accountWhere },
      include: { stock: { select: { ticker: true } } },
      orderBy: { entryDate: 'desc' },
    });

    // ── Period boundaries ──
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);
    const yearStart = startOfYear(now);

    const thisWeekTrades = closedPositions.filter((p) => p.exitDate && p.exitDate >= weekStart);
    const thisMonthTrades = closedPositions.filter((p) => p.exitDate && p.exitDate >= monthStart);
    const thisYearTrades = closedPositions.filter((p) => p.exitDate && p.exitDate >= yearStart);

    const periods = {
      thisWeek: computePeriodStats(thisWeekTrades),
      thisMonth: computePeriodStats(thisMonthTrades),
      thisYear: computePeriodStats(thisYearTrades),
      allTime: computePeriodStats(closedPositions),
    };

    // ── Account info ──
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        equity: true,
        t212TotalValue: true,
        t212Cash: true,
        t212Invested: true,
        t212IsaTotalValue: true,
        t212IsaCash: true,
        t212IsaInvested: true,
        t212Currency: true,
      },
    });

    // Compute total account balance based on filter
    let accountBalance = user?.equity ?? 0;
    if (accountFilter === 'invest') {
      accountBalance = user?.t212TotalValue ?? user?.equity ?? 0;
    } else if (accountFilter === 'isa') {
      accountBalance = user?.t212IsaTotalValue ?? 0;
    } else {
      accountBalance = (user?.t212TotalValue ?? 0) + (user?.t212IsaTotalValue ?? 0) || (user?.equity ?? 0);
    }

    // Trade risk = sum of (entry price * shares * initialRisk/entryPrice) for open positions
    let tradeRisk = 0;
    for (const p of openPositions) {
      if (p.currentStop > 0) {
        tradeRisk += Math.max(0, p.entryPrice - p.currentStop) * p.shares;
      } else {
        tradeRisk += p.initialRisk * p.shares;
      }
    }

    const account = {
      balance: accountBalance,
      tradeRisk,
      riskValue: accountBalance > 0 ? (tradeRisk / accountBalance) * 100 : 0,
      currency: user?.t212Currency ?? 'GBP',
    };

    // ── Equity Curve ──
    const snapshots = await prisma.equitySnapshot.findMany({
      orderBy: { capturedAt: 'asc' },
      select: { equity: true, capturedAt: true },
    });

    const equityCurve = snapshots.map((s) => ({
      date: s.capturedAt.toISOString().slice(0, 10),
      value: s.equity,
    }));

    // ── R-Multiple by month ──
    const rByMonthMap = new Map<string, { totalR: number; count: number }>();
    for (const p of closedPositions) {
      if (p.exitDate && p.realisedPnlR != null) {
        const key = p.exitDate.toISOString().slice(0, 7); // YYYY-MM
        const entry = rByMonthMap.get(key) ?? { totalR: 0, count: 0 };
        entry.totalR += p.realisedPnlR;
        entry.count++;
        rByMonthMap.set(key, entry);
      }
    }

    const rMultipleByMonth: RMultipleMonthRow[] = Array.from(rByMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month,
        avgR: v.count > 0 ? v.totalR / v.count : 0,
        totalR: v.totalR,
        tradeCount: v.count,
      }));

    // ── Trade lists ──
    const closedTrades: TradeRow[] = closedPositions.map((p) => {
      const daysHeld = p.exitDate
        ? Math.floor((p.exitDate.getTime() - p.entryDate.getTime()) / 86400000)
        : null;
      const pctGain = p.exitPrice != null && p.entryPrice > 0
        ? ((p.exitPrice - p.entryPrice) / p.entryPrice) * 100
        : null;
      return {
        id: p.id,
        ticker: p.stock.ticker,
        entryType: p.entry_type ?? 'BREAKOUT',
        entryDate: p.entryDate.toISOString().slice(0, 10),
        exitDate: p.exitDate?.toISOString().slice(0, 10) ?? null,
        rMultiple: p.realisedPnlR ?? p.exitProfitR ?? null,
        pctGain,
        pnlGbp: p.realisedPnlGbp ?? null,
        daysHeld,
        accountType: p.accountType ?? 'invest',
      };
    });

    const openTrades: TradeRow[] = openPositions.map((p) => ({
      id: p.id,
      ticker: p.stock.ticker,
      entryType: p.entry_type ?? 'BREAKOUT',
      entryDate: p.entryDate.toISOString().slice(0, 10),
      exitDate: null,
      rMultiple: null,
      pctGain: null,
      pnlGbp: null,
      daysHeld: Math.floor((now.getTime() - p.entryDate.getTime()) / 86400000),
      accountType: p.accountType ?? 'invest',
    }));

    // ── Monthly stats grid ──
    const monthlyMap = new Map<string, { totalR: number; totalPnl: number; wins: number; total: number }>();
    for (const p of closedPositions) {
      if (!p.exitDate) continue;
      const year = p.exitDate.getFullYear();
      const month = p.exitDate.getMonth() + 1;
      const key = `${year}-${month}`;
      const entry = monthlyMap.get(key) ?? { totalR: 0, totalPnl: 0, wins: 0, total: 0 };
      entry.totalR += p.realisedPnlR ?? 0;
      entry.totalPnl += p.realisedPnlGbp ?? 0;
      entry.total++;
      if ((p.realisedPnlR ?? 0) > 0.1) entry.wins++;
      monthlyMap.set(key, entry);
    }

    const monthlyStats: MonthlyStatRow[] = Array.from(monthlyMap.entries())
      .map(([key, v]) => {
        const [y, m] = key.split('-').map(Number);
        return {
          year: y,
          month: m,
          totalR: v.totalR,
          totalPnl: v.totalPnl,
          winRate: v.total > 0 ? (v.wins / v.total) * 100 : 0,
          tradeCount: v.total,
        };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);

    return NextResponse.json({
      ok: true,
      account,
      periods,
      equityCurve,
      rMultipleByMonth,
      openTrades,
      closedTrades,
      monthlyStats,
    });
  } catch (err) {
    console.error('GET /api/performance/analytics error:', err);
    return apiError(500, 'PERFORMANCE_ANALYTICS_ERROR', 'Failed to fetch performance analytics');
  }
}
