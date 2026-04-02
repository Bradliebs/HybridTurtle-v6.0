/**
 * DEPENDENCIES
 * Consumed by: GraphScorePanel component, TodayPanel
 * Consumes: gnn-inference.ts, api-response.ts
 * Risk-sensitive: NO — read-only scoring
 * Last modified: 2026-03-07
 * Notes: GET returns GNN score for a ticker. POST triggers retraining.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';
import { getGNNScore, type GNNScoreResult } from '@/lib/prediction/gnn/gnn-inference';
import { runGNNTraining } from '@/lib/prediction/gnn/gnn-trainer';
import type { NodeFeatures } from '@/lib/prediction/gnn/graph-builder';

export const dynamic = 'force-dynamic';

const numStr = (fallback: string) => z.string().default(fallback).transform(Number).pipe(z.number().finite());

const gnnQuerySchema = z.object({
  ticker: z.string().min(1, 'ticker is required').max(20),
  ncs: numStr('50'),
  volumeRatio: numStr('1'),
  atrPct: numStr('3'),
  regimeScore: numStr('50'),
  fmMax: numStr('0'),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, gnnQuerySchema);
  if (!qv.ok) return qv.response;

  const q = qv.data;

  try {
    // Build a minimal feature map for this ticker from validated params
    const featureMap = new Map<string, NodeFeatures>();

    featureMap.set(q.ticker, {
      ncs: q.ncs,
      priceReturn1d: 0,
      priceReturn5d: 0,
      volumeRatio: q.volumeRatio,
      atrPercentile: Math.min(q.atrPct / 8, 1),
      regimeScore: q.regimeScore,
      failureModeMax: q.fmMax,
    });

    const result = await getGNNScore(q.ticker, featureMap);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return apiError(500, 'GNN_SCORE_FAILED', 'Failed to compute GNN score', (error as Error).message);
  }
}

export async function POST() {
  try {
    const result = await runGNNTraining(true);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    console.error('[GNN] Training trigger error:', (error as Error).message);
    return apiError(500, 'GNN_TRAINING_FAILED', 'Failed to train GNN', (error as Error).message);
  }
}
