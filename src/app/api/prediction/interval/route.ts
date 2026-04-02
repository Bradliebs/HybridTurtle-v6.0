/**
 * DEPENDENCIES
 * Consumed by: NCSIntervalBadge component, TodayPanel
 * Consumes: conformal-store.ts, conformal-calibrator.ts, api-response.ts
 * Risk-sensitive: NO — read-only interval computation
 * Last modified: 2026-03-07
 * Notes: GET with query params returns NCS prediction interval.
 *        Returns null interval if no calibration exists yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';
import { getStoredInterval } from '@/lib/prediction/conformal-store';
import {
  classifyConfidence,
  getConformalDecision,
  DEFAULT_CONFORMAL_THRESHOLDS,
} from '@/lib/prediction/conformal-calibrator';

export const dynamic = 'force-dynamic';

const intervalQuerySchema = z.object({
  ncs: z.string().transform(Number).pipe(z.number().finite()),
  fws: z.string().transform(Number).pipe(z.number().finite()).optional(),
  coverage: z.string().transform(Number).pipe(z.number().finite().min(0).max(1)).optional(),
  regime: z.string().max(30).optional(),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, intervalQuerySchema);
  if (!qv.ok) return qv.response;

  const { ncs, fws, coverage, regime } = qv.data;

  try {
    const interval = await getStoredInterval(ncs, coverage ?? 0.9, regime ?? null);

    if (!interval) {
      return NextResponse.json({
        ok: true,
        data: {
          hasCalibration: false,
          interval: null,
          confidence: null,
          decision: null,
        },
      });
    }

    const confidence = classifyConfidence(interval.width);
    const decision = fws != null
      ? getConformalDecision(interval, fws, DEFAULT_CONFORMAL_THRESHOLDS)
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        hasCalibration: true,
        interval: {
          point: Math.round(interval.point * 10) / 10,
          lower: Math.round(interval.lower * 10) / 10,
          upper: Math.round(interval.upper * 10) / 10,
          width: Math.round(interval.width * 10) / 10,
          coverageLevel: interval.coverageLevel,
        },
        confidence,
        decision,
      },
    });
  } catch (error) {
    return apiError(500, 'INTERVAL_FAILED', 'Failed to compute interval', (error as Error).message);
  }
}
