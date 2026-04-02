/**
 * DEPENDENCIES
 * Consumed by: src/components/dashboard/SafetyAlertsPanel.tsx
 * Consumes: src/lib/api-response.ts, src/lib/safety-alerts.ts
 * Risk-sensitive: NO
 * Last modified: 2026-03-09
 * Notes: Phase 10 active-alert API. Optional `sync=true` triggers cooldown-controlled notification delivery.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';
import { getActiveSafetyAlerts, syncActiveSafetyAlerts } from '@/lib/safety-alerts';

const alertsActiveSchema = z.object({
  sync: z.enum(['true', 'false']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, alertsActiveSchema);
    if (!qv.ok) return qv.response;

    const sync = qv.data.sync === 'true';
    const snapshot = sync ? await syncActiveSafetyAlerts() : await getActiveSafetyAlerts();
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('GET /api/alerts/active error:', error);
    return apiError(500, 'ACTIVE_ALERTS_FAILED', 'Failed to load active safety alerts', (error as Error).message, true);
  }
}