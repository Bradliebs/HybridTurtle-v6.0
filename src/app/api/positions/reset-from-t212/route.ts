/**
 * DEPENDENCIES
 * Consumed by: PositionsTable.tsx (Reset from T212 button)
 * Consumes: prisma.ts, trading212.ts, trading212-dual.ts
 * Risk-sensitive: YES — overwrites entry price, stop, and initialRisk
 * Last modified: 2026-07-18
 * Notes: Pulls ground-truth entry price from T212's averagePricePaid,
 *        recalculates stops from scratch. Only for positions with corrupted data.
 *        Bypasses monotonic stop enforcement (stop-manager.ts) intentionally —
 *        this is a full position reset, not a regular stop adjustment.
 *        Safety: requires ?force=true when demoting protection above INITIAL.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Trading212Client, Trading212Error } from '@/lib/trading212';
import type { T212AccountType } from '@/lib/trading212-dual';
import { apiError } from '@/lib/api-response';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/request-validation';

const resetSchema = z.object({
  positionId: z.string().trim().min(1),
});

/**
 * POST — Reset a position's entry price and stop from Trading 212.
 *
 * Fetches the T212 position by ticker, overwrites:
 *   entryPrice, entry_price, initialRisk, initial_R, initial_stop,
 *   currentStop, stopLoss, protectionLevel
 *
 * Also logs a StopHistory record for audit trail.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, resetSchema);
    if (!parsed.ok) return parsed.response;

    const { positionId } = parsed.data;

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { stock: true },
    });

    if (!position) {
      return apiError(404, 'POSITION_NOT_FOUND', 'Position not found');
    }

    if (position.status === 'CLOSED') {
      return apiError(400, 'POSITION_CLOSED', 'Cannot reset a closed position');
    }

    const t212Ticker = position.t212Ticker || position.stock.t212Ticker;
    if (!t212Ticker) {
      return apiError(400, 'MISSING_T212_TICKER', `No T212 ticker for ${position.stock.ticker}. Sync with T212 first.`);
    }

    // Get T212 client for the correct account (invest/isa)
    const acctType: T212AccountType = position.accountType === 'isa' ? 'isa' : 'invest';
    const user = await prisma.user.findUnique({
      where: { id: position.userId },
      select: {
        t212ApiKey: true, t212ApiSecret: true, t212Environment: true, t212Connected: true,
        t212IsaApiKey: true, t212IsaApiSecret: true, t212IsaConnected: true,
      },
    });

    if (!user) return apiError(404, 'USER_NOT_FOUND', 'User not found');

    let client: Trading212Client;
    if (acctType === 'isa') {
      if (!user.t212IsaApiKey || !user.t212IsaApiSecret || !user.t212IsaConnected) {
        return apiError(400, 'T212_NOT_CONNECTED', 'T212 ISA not connected');
      }
      client = new Trading212Client(user.t212IsaApiKey, user.t212IsaApiSecret, user.t212Environment as 'demo' | 'live');
    } else {
      if (!user.t212ApiKey || !user.t212ApiSecret || !user.t212Connected) {
        return apiError(400, 'T212_NOT_CONNECTED', 'T212 Invest not connected');
      }
      client = new Trading212Client(user.t212ApiKey, user.t212ApiSecret, user.t212Environment as 'demo' | 'live');
    }

    // Fetch all T212 positions and find the matching one
    const t212Positions = await client.getPositions();
    const match = t212Positions.find((p) => p.instrument.ticker === t212Ticker);

    if (!match) {
      return apiError(404, 'T212_POSITION_NOT_FOUND',
        `No open position for ${t212Ticker} found on T212 (${acctType}). It may have been closed.`
      );
    }

    const newEntryPrice = match.averagePricePaid;
    const newShares = match.quantity;
    const currentPrice = match.currentPrice;

    if (newEntryPrice <= 0) {
      return apiError(400, 'INVALID_T212_DATA', `T212 returned invalid entry price: ${newEntryPrice}`);
    }

    // ── Safety: skip reset if entry price hasn't actually changed ──
    const ENTRY_PRICE_TOLERANCE = 0.005; // 0.5% — covers FX rounding and fractional share adjustments
    const entryPriceDelta = Math.abs(newEntryPrice - position.entryPrice) / position.entryPrice;
    if (entryPriceDelta < ENTRY_PRICE_TOLERANCE && newShares === position.shares) {
      return NextResponse.json({
        success: false,
        ticker: position.stock.ticker,
        t212Ticker,
        message: `No reset needed — T212 entry price ${newEntryPrice.toFixed(2)} matches current ${position.entryPrice.toFixed(2)} (within ${(ENTRY_PRICE_TOLERANCE * 100).toFixed(1)}% tolerance) and shares unchanged.`,
      }, { status: 200 });
    }

    // ── Safety: protect advanced stop levels from accidental demotion ──
    const LEVEL_ORDER = ['INITIAL', 'BREAKEVEN', 'LOCK_08R', 'LOCK_1R_TRAIL'] as const;
    const oldProtectionLevel = (position.protectionLevel as string) || 'INITIAL';
    const oldLevelIdx = LEVEL_ORDER.indexOf(oldProtectionLevel as typeof LEVEL_ORDER[number]);
    const isDemotingProtection = oldLevelIdx > 0; // anything above INITIAL

    if (isDemotingProtection) {
      const forceParam = request.nextUrl.searchParams.get('force');
      if (forceParam !== 'true') {
        return NextResponse.json({
          success: false,
          warning: true,
          ticker: position.stock.ticker,
          t212Ticker,
          currentProtectionLevel: oldProtectionLevel,
          message: `Position ${position.stock.ticker} has protection level '${oldProtectionLevel}'. Resetting will demote to INITIAL. Add ?force=true to confirm.`,
        }, { status: 409 });
      }
      console.warn(
        `[reset-from-t212] ⚠️ PROTECTION DEMOTION: ${position.stock.ticker} ` +
        `${oldProtectionLevel} → INITIAL (forced by caller). ` +
        `Old stop: ${position.currentStop.toFixed(2)}, new stop will be recalculated.`
      );
    }

    // Recalculate stops from scratch — 5% default initial risk
    const newInitialRisk = newEntryPrice * 0.05;
    const newStop = newEntryPrice - newInitialRisk;

    const resetReason =
      `BROKER-SYNC RESET: entry ${position.entryPrice.toFixed(2)} → ${newEntryPrice.toFixed(2)}, ` +
      `stop ${position.currentStop.toFixed(2)} → ${newStop.toFixed(2)}, ` +
      `protection ${oldProtectionLevel} → INITIAL` +
      (isDemotingProtection ? ' [DEMOTION — force=true]' : '');

    // Atomic update: position + stop history
    await prisma.$transaction([
      prisma.stopHistory.create({
        data: {
          positionId,
          oldStop: position.currentStop,
          newStop,
          level: 'INITIAL',
          reason: resetReason,
        },
      }),
      prisma.position.update({
        where: { id: positionId },
        data: {
          entryPrice: newEntryPrice,
          entry_price: newEntryPrice,
          shares: newShares,
          initialRisk: newInitialRisk,
          initial_R: newInitialRisk,
          initial_stop: newStop,
          stopLoss: newStop,
          currentStop: newStop,
          protectionLevel: 'INITIAL',
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      ticker: position.stock.ticker,
      t212Ticker,
      old: {
        entryPrice: position.entryPrice,
        currentStop: position.currentStop,
        initialRisk: position.initialRisk,
        protectionLevel: oldProtectionLevel,
      },
      new: {
        entryPrice: newEntryPrice,
        currentStop: newStop,
        initialRisk: newInitialRisk,
        shares: newShares,
        currentPrice,
      },
      protectionDemoted: isDemotingProtection,
      message: `Reset ${position.stock.ticker} from T212: entry ${position.entryPrice.toFixed(2)} → ${newEntryPrice.toFixed(2)}, stop → ${newStop.toFixed(2)}` +
        (isDemotingProtection ? ` (protection demoted: ${oldProtectionLevel} → INITIAL)` : ''),
    });
  } catch (error) {
    if (error instanceof Trading212Error) {
      return apiError(error.statusCode === 429 ? 429 : 400, 'T212_ERROR', error.message, undefined, error.statusCode === 429);
    }
    return apiError(500, 'RESET_FAILED', (error as Error).message, undefined, true);
  }
}
