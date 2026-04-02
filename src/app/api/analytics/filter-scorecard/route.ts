/**
 * DEPENDENCIES
 * Consumed by: /filter-scorecard page
 * Consumes: filter-scorecard.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { generateFilterScorecard } from '@/lib/filter-scorecard';

const filterScorecardQuerySchema = z.object({
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  sleeve: z.string().max(30).optional(),
  status: z.string().max(30).optional(),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, filterScorecardQuerySchema);
  if (!qv.ok) return qv.response;

  const { from, to, sleeve, status } = qv.data;

  const result = await generateFilterScorecard({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    sleeve,
    status,
  });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=60' },
  });
}
