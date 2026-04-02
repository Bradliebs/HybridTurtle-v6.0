/**
 * DEPENDENCIES
 * Consumed by: AutoStopsPanel.tsx (settings), external scheduler
 * Consumes: auto-stop-service.ts, prisma.ts
 * Risk-sensitive: YES — triggers automatic stop updates
 * Last modified: 2026-04-01
 * Notes: GET returns autopilot status. POST triggers a manual cycle. PUT toggles the setting.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { runAutoStopCycle } from '@/lib/auto-stop-service';
import { ensureDefaultUser } from '@/lib/default-user';
import { parseJsonBody } from '@/lib/request-validation';
import { apiError } from '@/lib/api-response';

// GET /api/stops/auto — check autopilot status
export async function GET() {
  try {
    await ensureDefaultUser();
    const user = await prisma.user.findUnique({
      where: { id: 'default-user' },
      select: { autoStopsEnabled: true },
    });

    if (!user) return apiError(404, 'USER_NOT_FOUND', 'User not found');

    return NextResponse.json({ autoStopsEnabled: user.autoStopsEnabled });
  } catch (error) {
    console.error('GET /api/stops/auto error:', error);
    return apiError(500, 'AUTO_STOPS_STATUS_FAILED', 'Failed to get auto-stop status', (error as Error).message, true);
  }
}

const toggleSchema = z.object({
  autoStopsEnabled: z.boolean(),
});

// PUT /api/stops/auto — toggle autopilot on/off
export async function PUT(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, toggleSchema);
    if (!parsed.ok) return parsed.response;

    await ensureDefaultUser();
    const user = await prisma.user.update({
      where: { id: 'default-user' },
      data: { autoStopsEnabled: parsed.data.autoStopsEnabled },
      select: { autoStopsEnabled: true },
    });

    return NextResponse.json({
      autoStopsEnabled: user.autoStopsEnabled,
      message: user.autoStopsEnabled ? 'Auto-stop autopilot enabled' : 'Auto-stop autopilot disabled',
    });
  } catch (error) {
    console.error('PUT /api/stops/auto error:', error);
    return apiError(500, 'AUTO_STOPS_TOGGLE_FAILED', 'Failed to toggle auto-stops', (error as Error).message, true);
  }
}

// POST /api/stops/auto — trigger a manual auto-stop cycle
export async function POST() {
  try {
    const result = await runAutoStopCycle('default-user');

    if (!result.enabled) {
      return NextResponse.json({
        ...result,
        message: 'Auto-stop autopilot is disabled. Enable it in Settings first.',
      }, { status: 200 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/stops/auto error:', error);
    return apiError(500, 'AUTO_STOPS_CYCLE_FAILED', 'Auto-stop cycle failed', (error as Error).message, true);
  }
}
