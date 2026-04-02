/**
 * DEPENDENCIES
 * Consumed by: Analytics UI
 * Consumes: execution-drag.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { computeExecutionDrag } from '@/lib/execution-drag';

const execDragQuerySchema = z.object({
  userId: z.string().max(100).optional(),
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, execDragQuerySchema);
  if (!qv.ok) return qv.response;

  const { userId, from, to } = qv.data;

  const result = await computeExecutionDrag({
    userId,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return NextResponse.json({
    ok: true,
    summary: result.summary,
    records: result.records,
  });
}
