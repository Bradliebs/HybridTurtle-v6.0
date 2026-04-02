/**
 * DEPENDENCIES
 * Consumed by: frontend (audit log viewer)
 * Consumes: packages/data/src/prisma.ts, src/lib/api-response.ts
 * Risk-sensitive: NO — read-only
 * Last modified: 2026-03-09
 * Notes: Phase 13 gap fix — generic audit event log with pagination and filtering.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../packages/data/src/prisma';
import { apiError } from '@/lib/api-response';
import { z } from 'zod';

const auditQuerySchema = z.object({
  eventType: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const parsed = auditQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return apiError(400, 'INVALID_PARAMS', parsed.error.issues.map(i => i.message).join('; '));
    }
    const { eventType, entityType, entityId, limit, offset } = parsed.data;

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        entityType: e.entityType,
        entityId: e.entityId,
        payloadJson: e.payloadJson,
        createdAt: e.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Audit events fetch error:', error);
    return apiError(500, 'AUDIT_EVENTS_FAILED', 'Failed to fetch audit events', (error as Error).message, true);
  }
}
