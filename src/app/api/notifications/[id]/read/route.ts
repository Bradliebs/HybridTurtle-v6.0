/**
 * DEPENDENCIES
 * Consumed by: /notifications page
 * Consumes: prisma.ts
 * Risk-sensitive: NO
 * Last modified: 2026-02-28
 * Notes: POST marks a single notification as read by setting readAt.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    if (isNaN(id)) {
      return apiError(400, 'INVALID_ID', 'Invalid notification ID');
    }

    const notification = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ notification });
  } catch (error) {
    console.error('[POST /api/notifications/:id/read] Error:', (error as Error).message);
    return apiError(500, 'NOTIFICATION_READ_FAILED', 'Failed to mark notification as read');
  }
}
