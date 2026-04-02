/**
 * DEPENDENCIES
 * Consumed by: TradeAdvisorPanel component
 * Consumes: maml-trainer.ts, policy-network.ts, trade-state-encoder.ts, api-response.ts
 * Risk-sensitive: NO — advisory recommendations only
 * Last modified: 2026-03-07
 * Notes: GET returns recommended action for an open trade.
 *        POST triggers MAML retraining.
 *        Recommendations are SUGGESTIONS — human approves before execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, parseQueryParams } from '@/lib/request-validation';
import { apiError } from '@/lib/api-response';
import { sendAlert } from '@/lib/alert-service';
import { prisma } from '@/lib/prisma';
import { encodeObservation, getTopFeatures, ACTIONS, ACTION_LABELS, type TradeObservation } from '@/lib/prediction/meta-rl/trade-state-encoder';
import { policyForward } from '@/lib/prediction/meta-rl/policy-network';
import { loadLatestPolicy, runMAMLTraining } from '@/lib/prediction/meta-rl/maml-trainer';

export const dynamic = 'force-dynamic';

const numStr = (fallback: string) => z.string().default(fallback).transform(Number).pipe(z.number().finite());
const intStr = (fallback: string, min = 0, max?: number) => {
  let schema = z.string().default(fallback).transform(Number).pipe(z.number().int().min(min));
  if (max !== undefined) schema = z.string().default(fallback).transform(Number).pipe(z.number().int().min(min).max(max));
  return schema;
};

const tradeRecQuerySchema = z.object({
  ticker: z.string().min(1).max(20).optional(),
  rMultiple: numStr('0'),
  daysInTrade: intStr('0'),
  stopDistanceAtr: numStr('1.5'),
  pyramidLevel: intStr('0', 0, 2),
  regimeScore: numStr('50'),
  vixPercentile: numStr('50'),
  volumeTrend3d: numStr('1'),
  priceVsEntry: numStr('0'),
  ncs: numStr('50'),
  beliefNCS: numStr('50'),
  fm1: numStr('0'),
  fm4: numStr('0'),
  openRisk: numStr('5'),
  correlation: numStr('0.3'),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, tradeRecQuerySchema);
  if (!qv.ok) return qv.response;

  const q = qv.data;

  try {
    // Build observation from validated query params
    const obs: TradeObservation = {
      rMultipleCurrent: q.rMultiple,
      daysInTrade: q.daysInTrade,
      stopDistanceAtr: q.stopDistanceAtr,
      pyramidLevel: q.pyramidLevel,
      regimeScore: q.regimeScore,
      vixPercentile: q.vixPercentile,
      volumeTrend3d: q.volumeTrend3d,
      priceVsEntryPercent: q.priceVsEntry,
      currentNCS: q.ncs,
      beliefWeightedNCS: q.beliefNCS,
      fm1Score: q.fm1,
      fm4Score: q.fm4,
      openRiskPercent: q.openRisk,
      correlationWithPortfolio: q.correlation,
    };

    const vec = encodeObservation(obs);
    const { weights, trained } = await loadLatestPolicy();
    const output = policyForward(vec, weights);
    const topFeatures = getTopFeatures(vec);

    const bestAction = ACTIONS[output.bestAction];

    // Notification: RL EXIT EARLY with high confidence (item 30) — max once per 6h per ticker
    if (bestAction === 'FULL_EXIT' && output.confidence > 0.80) {
      const ticker = q.ticker ?? 'unknown';
      try {
        const lastAlert = await prisma.notification.findFirst({
          where: { type: 'RL_EXIT_EARLY', data: { contains: ticker } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        const cooldownExpired = !lastAlert || (Date.now() - lastAlert.createdAt.getTime() > 6 * 60 * 60 * 1000);
        if (cooldownExpired) {
          await sendAlert({
            type: 'RL_EXIT_EARLY',
            title: 'RL Advisor: Exit Recommended',
            message: `RL advisor recommends early exit: ${ticker} — ${Math.round(output.confidence * 100)}% confidence`,
            priority: 'WARNING',
            data: { ticker, confidence: output.confidence },
          });
        }
      } catch { /* non-critical */ }
    }

    return NextResponse.json({
      ok: true,
      data: {
        recommendation: bestAction,
        label: ACTION_LABELS[bestAction],
        confidence: output.confidence,
        actionProbs: Object.fromEntries(ACTIONS.map((a, i) => [a, output.actionProbs[i]])),
        topFeatures,
        modelTrained: trained,
      },
    });
  } catch (error) {
    return apiError(500, 'TRADE_REC_FAILED', 'Failed to compute trade recommendation', (error as Error).message);
  }
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(request, z.object({ force: z.boolean().optional().default(false) }));
  if (!parsed.ok) return parsed.response;

  try {
    const result = await runMAMLTraining(parsed.data.force);
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return apiError(500, 'MAML_TRAINING_FAILED', 'Failed to run MAML training', (error as Error).message);
  }
}
