/**
 * DEPENDENCIES
 * Consumed by: KellySizePanel component
 * Consumes: portfolio-kelly.ts, api-response.ts
 * Risk-sensitive: NO — advisory sizing suggestion only
 * Last modified: 2026-03-07
 * Notes: GET returns Kelly-adjusted position size suggestion.
 *        Output is a SUGGESTION — position-sizer.ts hard caps always prevail.
 *        ⛔ Does NOT modify position-sizer.ts or risk-gates.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';
import { computePortfolioKelly } from '@/lib/prediction/kelly/portfolio-kelly';

export const dynamic = 'force-dynamic';

const numStr = (fallback: string) => z.string().default(fallback).transform(Number).pipe(z.number().finite());

const kellyQuerySchema = z.object({
  ncs: numStr('50'),
  winRate: z.string().default('0.45').transform(Number).pipe(z.number().finite().min(0).max(1)),
  avgWinR: numStr('2.0'),
  avgLossR: numStr('1.0'),
  maxRisk: numStr('2.0'),
  conformalWidth: numStr('10'),
  beliefMean: numStr('0.5'),
  gnnConf: numStr('0.5'),
  avgCorr: numStr('0.3'),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, kellyQuerySchema);
  if (!qv.ok) return qv.response;

  const q = qv.data;

  try {
    const result = computePortfolioKelly({
      ncs: q.ncs,
      baseWinRate: q.winRate,
      avgWinR: q.avgWinR,
      avgLossR: q.avgLossR,
      uncertainty: {
        conformalIntervalWidth: q.conformalWidth,
        beliefMean: q.beliefMean,
        gnnConfidence: q.gnnConf,
      },
      avgCorrelationWithPortfolio: q.avgCorr,
      maxRiskPerTrade: q.maxRisk,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return apiError(500, 'KELLY_FAILED', 'Failed to compute Kelly size', (error as Error).message);
  }
}
