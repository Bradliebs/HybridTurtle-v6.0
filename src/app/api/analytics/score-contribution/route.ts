/**
 * DEPENDENCIES
 * Consumed by: Analytics UI
 * Consumes: score-tracker.ts, prisma.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { parseQueryParams } from '@/lib/request-validation';
import { backfillScoreOutcomes } from '@/lib/score-tracker';

const scoreContribQuerySchema = z.object({
  regime: z.string().max(30).optional(),
  component: z.string().max(50).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  withOutcomes: z.enum(['true', 'false']).optional(),
  limit: z.string().default('500').transform(Number).pipe(z.number().int().min(1).max(2000)),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, scoreContribQuerySchema);
  if (!qv.ok) return qv.response;

  const { regime, component, from, to, withOutcomes, limit } = qv.data;

  const where: Record<string, unknown> = {};
  if (regime) where.regime = regime;
  if (from || to) {
    where.scoredAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (withOutcomes === 'true') {
    where.outcomeR = { not: null };
  }

  const rows = await prisma.scoreBreakdown.findMany({
    where,
    orderBy: { scoredAt: 'desc' },
    take: limit,
  });

  // If a specific component is requested, compute correlation stats
  if (component && rows.length > 0) {
    const validRows = rows.filter(
      (r) => r.outcomeR != null && r[component as keyof typeof r] != null
    );

    if (validRows.length >= 10) {
      const compValues = validRows.map((r) => Number(r[component as keyof typeof r]) || 0);
      const outcomes = validRows.map((r) => r.outcomeR as number);

      // Simple Pearson correlation
      const n = compValues.length;
      const meanX = compValues.reduce((a, b) => a + b, 0) / n;
      const meanY = outcomes.reduce((a, b) => a + b, 0) / n;
      let covXY = 0, varX = 0, varY = 0;
      for (let i = 0; i < n; i++) {
        const dx = compValues[i] - meanX;
        const dy = outcomes[i] - meanY;
        covXY += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
      }
      const correlation = varX > 0 && varY > 0
        ? covXY / Math.sqrt(varX * varY)
        : 0;

      // Bucket into quartiles for component value → outcome analysis
      const sorted = [...validRows].sort(
        (a, b) => (Number(a[component as keyof typeof a]) || 0) - (Number(b[component as keyof typeof b]) || 0)
      );
      const quartileSize = Math.floor(sorted.length / 4);
      const quartiles = [0, 1, 2, 3].map((q) => {
        const start = q * quartileSize;
        const end = q === 3 ? sorted.length : start + quartileSize;
        const slice = sorted.slice(start, end);
        const avgOutcome = slice.reduce((s, r) => s + (r.outcomeR ?? 0), 0) / slice.length;
        const avgComp = slice.reduce((s, r) => s + (Number(r[component as keyof typeof r]) || 0), 0) / slice.length;
        return {
          quartile: q + 1,
          avgComponentValue: Math.round(avgComp * 100) / 100,
          avgOutcomeR: Math.round(avgOutcome * 100) / 100,
          count: slice.length,
        };
      });

      return NextResponse.json({
        ok: true,
        component,
        sampleSize: validRows.length,
        correlation: Math.round(correlation * 1000) / 1000,
        quartiles,
      });
    }
  }

  return NextResponse.json({ ok: true, count: rows.length, rows });
}

/**
 * POST /api/analytics/score-contribution
 * Triggers backfill of outcomes from closed trades.
 */
export async function POST() {
  const updated = await backfillScoreOutcomes();
  return NextResponse.json({ ok: true, updated });
}
