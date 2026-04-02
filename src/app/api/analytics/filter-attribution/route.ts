/**
 * DEPENDENCIES
 * Consumed by: Analytics UI
 * Consumes: filter-attribution.ts, prisma.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { parseQueryParams } from '@/lib/request-validation';
import { backfillFilterOutcomes } from '@/lib/filter-attribution';

const filterAttrQuerySchema = z.object({
  regime: z.string().max(30).optional(),
  filter: z.string().max(50).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  withOutcomes: z.enum(['true', 'false']).optional(),
  limit: z.string().default('500').transform(Number).pipe(z.number().int().min(1).max(2000)),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, filterAttrQuerySchema);
  if (!qv.ok) return qv.response;

  const { regime, filter: filterName, from, to, withOutcomes, limit } = qv.data;

  const where: Record<string, unknown> = {};
  if (regime) where.regime = regime;
  if (from || to) {
    where.scanDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (withOutcomes === 'true') {
    where.outcomeR = { not: null };
  }

  const rows = await prisma.filterAttribution.findMany({
    where,
    orderBy: { scanDate: 'desc' },
    take: limit,
  });

  // If a specific filter is requested, compute hit-rate stats
  if (filterName && rows.length > 0) {
    const passedRows = rows.filter((r) => {
      const val = r[filterName as keyof typeof r];
      return typeof val === 'boolean' ? val : false;
    });
    const failedRows = rows.filter((r) => {
      const val = r[filterName as keyof typeof r];
      return typeof val === 'boolean' ? !val : false;
    });

    const avgR = (arr: typeof rows) => {
      const withR = arr.filter((r) => r.outcomeR != null);
      if (withR.length === 0) return null;
      return withR.reduce((sum, r) => sum + (r.outcomeR ?? 0), 0) / withR.length;
    };

    return NextResponse.json({
      ok: true,
      filter: filterName,
      total: rows.length,
      passed: passedRows.length,
      failed: failedRows.length,
      passRate: rows.length > 0 ? passedRows.length / rows.length : 0,
      passedAvgR: avgR(passedRows),
      failedAvgR: avgR(failedRows),
      rows,
    });
  }

  return NextResponse.json({ ok: true, count: rows.length, rows });
}

/**
 * POST /api/analytics/filter-attribution
 * Triggers backfill of outcomes from closed trades.
 */
export async function POST() {
  const updated = await backfillFilterOutcomes();
  return NextResponse.json({ ok: true, updated });
}
