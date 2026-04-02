/**
 * DEPENDENCIES
 * Consumed by: /trade-pulse/[ticker] page
 * Consumes: trade-pulse.ts, multiple prediction APIs for data gathering
 * Risk-sensitive: NO — advisory scoring only
 * Last modified: 2026-03-07
 * Notes: GET returns full TradePulse analysis for a ticker.
 *        Aggregates data from all prediction layers into one response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';
import { computeTradePulse, type TradePulseInput } from '@/lib/prediction/trade-pulse';

export const dynamic = 'force-dynamic';

const optionalNum = z.string().transform(Number).pipe(z.number().finite()).optional();

const tradePulseQuerySchema = z.object({
  ticker: z.string().min(1, 'ticker is required').max(20),
  ncs: z.string().transform(Number).pipe(z.number().finite().min(0).max(100)).optional(),
  fws: z.string().transform(Number).pipe(z.number().finite().min(0).max(100)).optional(),
  conformalWidth: optionalNum,
  fmMax: z.string().transform(Number).pipe(z.number().finite().min(0)).optional(),
  fmBlocks: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
  stressProb: z.string().transform(Number).pipe(z.number().finite().min(0).max(1)).optional(),
  gnn: z.string().transform(Number).pipe(z.number().finite().min(0).max(1)).optional(),
  belief: optionalNum,
  kelly: optionalNum,
  dofi: z.string().transform(Number).pipe(z.number().finite().min(-1).max(1)).optional(),
  scs: z.string().transform(Number).pipe(z.number().finite().min(0).max(100)).optional(),
  invariance: z.string().transform(Number).pipe(z.number().finite().min(0).max(1)).optional(),
  danger: z.string().transform(Number).pipe(z.number().finite().min(0).max(100)).optional(),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, tradePulseQuerySchema);
  if (!qv.ok) return qv.response;

  const q = qv.data;

  try {
    // Build input from validated query params
    const input: TradePulseInput = {
      ncs: q.ncs ?? 50,
      fws: q.fws ?? 30,
      conformalWidth: q.conformalWidth ?? null,
      fmMaxScore: q.fmMax ?? 0,
      fmBlockCount: q.fmBlocks ?? 0,
      stressTestProb: q.stressProb ?? null,
      gnnScore: q.gnn ?? null,
      beliefMean: q.belief ?? null,
      kellyVsFixed: q.kelly ?? null,
      vpinDofi: q.dofi ?? null,
      sentimentScs: q.scs ?? null,
      invarianceAvg: q.invariance ?? null,
      dangerScore: q.danger ?? 0,
    };

    const result = computeTradePulse(input);

    return NextResponse.json({
      ok: true,
      data: {
        ticker: q.ticker,
        ...result,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return apiError(500, 'TRADE_PULSE_FAILED', 'Failed to compute TradePulse', (error as Error).message);
  }
}
