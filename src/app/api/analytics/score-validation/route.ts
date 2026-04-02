/**
 * DEPENDENCIES
 * Consumed by: /score-validation page
 * Consumes: score-validation.ts, score-backfill.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { generateScoreValidation } from '@/lib/score-validation';
import { backfillScoresOnOutcomes } from '@/lib/score-backfill';
import { backfillTradeLinks } from '@/lib/candidate-outcome';
import { enrichCandidateOutcomes } from '@/lib/candidate-outcome-enrichment';

const scoreValQuerySchema = z.object({
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  sleeve: z.string().max(30).optional(),
});

const scoreValPostSchema = z.object({
  action: z.enum(['backfill-scores', 'refresh-outcomes', 'full-refresh']).default('backfill-scores'),
});

/**
 * GET /api/analytics/score-validation
 * Generate score validation report.
 */
export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, scoreValQuerySchema);
  if (!qv.ok) return qv.response;

  const { from, to, sleeve } = qv.data;

  const result = await generateScoreValidation({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    sleeve,
  });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=60' },
  });
}

/**
 * POST /api/analytics/score-validation
 * Trigger score backfill and/or outcome refresh actions for the Score Validation page.
 */
export async function POST(request: NextRequest) {
  let parsedBody: z.infer<typeof scoreValPostSchema> = { action: 'backfill-scores' };
  try {
    const rawBody = await request.json();
    parsedBody = scoreValPostSchema.parse(rawBody);
  } catch {
    parsedBody = { action: 'backfill-scores' };
  }

  if (parsedBody.action === 'backfill-scores') {
    const result = await backfillScoresOnOutcomes();
    return NextResponse.json({ ok: true, action: parsedBody.action, ...result });
  }

  const tradesLinked = await backfillTradeLinks();
  const enrichment = await enrichCandidateOutcomes(8, 100, 100);

  if (parsedBody.action === 'refresh-outcomes') {
    return NextResponse.json({
      ok: true,
      action: parsedBody.action,
      tradesLinked,
      enrichment,
    });
  }

  const scoreBackfill = await backfillScoresOnOutcomes();
  return NextResponse.json({
    ok: true,
    action: parsedBody.action,
    tradesLinked,
    enrichment,
    scoreBackfill,
  });
}
