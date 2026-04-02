import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ensureDefaultUser } from '@/lib/default-user';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';

export const dynamic = 'force-dynamic';

type TagCounter = Record<string, number>;

type TradeRow = {
  finalRMultiple: number | null;
  gainLossGbp: number | null;
  slippagePct: number | null;
  decisionReason: string | null;
  regime: string | null;
  tags: string | null;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];

  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string') as string[];
    }
  } catch {
    // ignore malformed tags JSON
  }

  return [];
}

function topItems(counter: TagCounter, size = 5): Array<{ key: string; count: number }> {
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([key, count]) => ({ key, count }));
}

const tradeLogSummarySchema = z.object({
  userId: z.string().max(100).optional(),
  ticker: z.string().max(20).optional(),
  decision: z.string().max(30).optional(),
  tradeType: z.string().max(30).optional(),
  regime: z.string().max(30).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, tradeLogSummarySchema);
    if (!qv.ok) return qv.response;

    const q = qv.data;

    let userId = q.userId ?? null;
    if (!userId) {
      userId = await ensureDefaultUser();
    }

    const ticker = q.ticker;
    const decision = q.decision;
    const tradeType = q.tradeType;
    const regime = q.regime;
    const from = parseDate(q.from ?? null);
    const to = parseDate(q.to ?? null);

    const rows = (await prisma.tradeLog.findMany({
      where: {
        userId,
        ...(ticker ? { ticker: { contains: ticker } } : {}),
        ...(decision ? { decision } : {}),
        ...(tradeType ? { tradeType } : {}),
        ...(regime ? { regime } : {}),
        ...(from || to
          ? {
              tradeDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      select: {
        finalRMultiple: true,
        gainLossGbp: true,
        slippagePct: true,
        decisionReason: true,
        regime: true,
        tags: true,
      },
    })) as TradeRow[];

    const outcomeRows = rows.filter((row) => row.finalRMultiple !== null || row.gainLossGbp !== null);

    const workedRows = outcomeRows.filter((row) => {
      if (row.finalRMultiple !== null) return row.finalRMultiple > 0;
      return (row.gainLossGbp || 0) > 0;
    });

    const failedRows = outcomeRows.filter((row) => {
      if (row.finalRMultiple !== null) return row.finalRMultiple <= 0;
      return (row.gainLossGbp || 0) <= 0;
    });

    const avgR = outcomeRows.length > 0
      ? outcomeRows.reduce((sum, row) => sum + (row.finalRMultiple ?? 0), 0) / outcomeRows.length
      : null;

    const avgSlippage = rows.filter((row) => row.slippagePct !== null);
    const avgSlippagePct = avgSlippage.length > 0
      ? avgSlippage.reduce((sum, row) => sum + (row.slippagePct ?? 0), 0) / avgSlippage.length
      : null;

    const reasonCounter: TagCounter = {};
    rows.forEach((row) => {
      if (row.decisionReason) {
        reasonCounter[row.decisionReason] = (reasonCounter[row.decisionReason] || 0) + 1;
      }
    });

    const winningTagCounter: TagCounter = {};
    workedRows.forEach((row) => {
      parseTags(row.tags).forEach((tag) => {
        winningTagCounter[tag] = (winningTagCounter[tag] || 0) + 1;
      });
    });

    const losingTagCounter: TagCounter = {};
    failedRows.forEach((row) => {
      parseTags(row.tags).forEach((tag) => {
        losingTagCounter[tag] = (losingTagCounter[tag] || 0) + 1;
      });
    });

    const regimeCounter: Record<string, { count: number; avgR: number | null }> = {};
    const groupedByRegime: Record<string, number[]> = {};

    outcomeRows.forEach((row) => {
      const key = row.regime || 'UNKNOWN';
      if (!groupedByRegime[key]) groupedByRegime[key] = [];
      groupedByRegime[key].push(row.finalRMultiple ?? 0);
    });

    Object.entries(groupedByRegime).forEach(([regime, values]) => {
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
      regimeCounter[regime] = { count: values.length, avgR: avg };
    });

    return NextResponse.json({
      totals: {
        totalLogs: rows.length,
        totalOutcomes: outcomeRows.length,
        worked: workedRows.length,
        failed: failedRows.length,
        winRate: outcomeRows.length > 0 ? (workedRows.length / outcomeRows.length) * 100 : 0,
        expectancyR: avgR,
        avgSlippagePct,
      },
      topDecisionReasons: topItems(reasonCounter),
      topWinningTags: topItems(winningTagCounter),
      topLosingTags: topItems(losingTagCounter),
      byRegime: regimeCounter,
    });
  } catch (error) {
    console.error('Trade log summary error:', error);
    return apiError(500, 'TRADE_LOG_SUMMARY_FAILED', 'Failed to fetch trade log summary', (error as Error).message, true);
  }
}
