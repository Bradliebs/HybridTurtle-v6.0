export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runHealthCheck } from '@/lib/health-check';
import { z } from 'zod';
import { parseJsonBody, parseQueryParams } from '@/lib/request-validation';
import { apiError } from '@/lib/api-response';

const healthCheckBodySchema = z.object({
  userId: z.string().trim().min(1),
});

const healthCheckGetSchema = z.object({
  userId: z.string().min(1, 'userId is required').max(100),
});

export async function GET(request: NextRequest) {
  try {
    const qv = parseQueryParams(request, healthCheckGetSchema);
    if (!qv.ok) return qv.response;

    const { userId } = qv.data;

    const report = await runHealthCheck(userId);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Health check error:', error);
    return apiError(500, 'HEALTH_CHECK_FAILED', 'Health check failed', (error as Error).message, true);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, healthCheckBodySchema);
    if (!parsed.ok) {
      return parsed.response;
    }
    const { userId } = parsed.data;

    const report = await runHealthCheck(userId);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Health check error:', error);
    return apiError(500, 'HEALTH_CHECK_FAILED', 'Health check failed', (error as Error).message, true);
  }
}
