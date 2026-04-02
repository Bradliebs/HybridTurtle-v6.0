/**
 * DEPENDENCIES
 * Consumed by: Dashboard / analytics frontend
 * Consumes: ev-tracker.ts, default-user.ts, api-response.ts
 * Risk-sensitive: NO
 * Last modified: 2026-02-24
 * Notes: Read-only endpoint. Returns expectancy stats sliced by regime, ATR bucket,
 *        cluster, and sleeve. No mutations.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExpectancyStats } from '@/lib/ev-tracker';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';

export const dynamic = 'force-dynamic';

const evStatsQuerySchema = z.object({
  regime: z.string().max(30).optional(),
  sleeve: z.string().max(30).optional(),
  atrBucket: z.string().max(30).optional(),
  cluster: z.string().max(50).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, evStatsQuerySchema);
    if (!qv.ok) return qv.response;

    const { regime, sleeve, atrBucket, cluster } = qv.data;

    const stats = await getExpectancyStats({ regime, sleeve, atrBucket, cluster });

    return NextResponse.json({ ok: true, data: stats });
  } catch (error) {
    console.error('EV stats error:', error);
    return apiError(500, 'EV_STATS_FAILED', 'Failed to fetch expectancy stats', (error as Error).message, true);
  }
}
