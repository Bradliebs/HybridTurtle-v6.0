/**
 * DEPENDENCIES
 * Consumed by: src/components/dashboard/TonightWorkflowCard.tsx
 * Consumes: packages/workflow/src/index.ts, src/lib/api-response.ts
 * Risk-sensitive: NO
 * Last modified: 2026-03-09
 * Notes: Phase 4 gap fix — exposes getTonightWorkflowCardData() and runTonightWorkflow() to the UI.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getTonightWorkflowCardData, runTonightWorkflow } from '../../../../../packages/workflow/src';
import { apiError } from '@/lib/api-response';

export async function GET() {
  try {
    const card = await getTonightWorkflowCardData();
    return NextResponse.json({ card });
  } catch (error) {
    console.error('Tonight workflow card error:', error);
    return apiError(500, 'WORKFLOW_CARD_FAILED', 'Failed to fetch tonight workflow card', (error as Error).message, true);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate: accept either CRON_SECRET (for external/scheduled calls)
  // or a valid NextAuth session (for dashboard-triggered runs)
  const cronSecret = request.headers.get('x-cron-secret');
  const hasCronAuth = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!hasCronAuth) {
    const enforceAuth = process.env.ENFORCE_API_AUTH === 'true';
    if (enforceAuth) {
      return apiError(401, 'UNAUTHORIZED', 'Missing or invalid CRON_SECRET');
    }
  }

  try {
    const result = await runTonightWorkflow();
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Tonight workflow run error:', error);
    return apiError(500, 'WORKFLOW_RUN_FAILED', 'Failed to run tonight workflow', (error as Error).message, true);
  }
}
