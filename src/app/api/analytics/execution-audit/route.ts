/**
 * DEPENDENCIES
 * Consumed by: /execution-audit page
 * Consumes: execution-audit.ts
 * Risk-sensitive: NO — read-only analytics
 * Last modified: 2026-03-06
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseQueryParams } from '@/lib/request-validation';
import { generateExecutionAudit } from '@/lib/execution-audit';

const execAuditQuerySchema = z.object({
  from: z.string().max(30).optional(),
  to: z.string().max(30).optional(),
  sleeve: z.string().max(30).optional(),
});

export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, execAuditQuerySchema);
  if (!qv.ok) return qv.response;

  const { from, to, sleeve } = qv.data;

  const result = await generateExecutionAudit({
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    sleeve,
  });

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
  });
}
