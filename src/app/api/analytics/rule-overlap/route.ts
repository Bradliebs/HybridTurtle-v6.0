/**
 * DEPENDENCIES
 * Consumed by: Analytics UI
 * Consumes: rule-overlap.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { computeRuleOverlap } from '@/lib/rule-overlap';

const ruleOverlapQuerySchema = z.object({
  regime: z.string().max(30).optional(),
  minSamples: z.string().default('30').transform(Number).pipe(z.number().int().min(1).max(10000)),
  threshold: z.string().default('0.5').transform(Number).pipe(z.number().finite().min(0).max(1)),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, ruleOverlapQuerySchema);
  if (!qv.ok) return qv.response;

  const { regime, minSamples: minSampleSize, threshold: coOccurrenceThreshold } = qv.data;

  const pairs = await computeRuleOverlap({
    regime,
    minSampleSize,
    coOccurrenceThreshold,
  });

  return NextResponse.json({
    ok: true,
    count: pairs.length,
    pairs,
  });
}
