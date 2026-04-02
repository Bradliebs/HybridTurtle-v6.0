// ============================================================
// Pairs Tracker — Manages Open PEAD Positions Nightly
// ============================================================
//
// LONG-ONLY MODE: tracks long leg only.
// Monitors z-score convergence, applies time stops, closes positions.
//
// Exit logic:
//   convergence: zScore crosses 0 → close
//   stop-loss:   |zScore| >= 4.0  → close + 10-day cooling
//   time-stop:   day 30           → close unconditionally
//   partial:     day 10 + zScore < 1.0 → close 50%
// ============================================================

import 'server-only';
import { getStockQuote } from '@/lib/market-data';
import prisma from '@/lib/prisma';
import { getCurrentZScore, STOP_ZSCORE, EXIT_ZSCORE } from './pairs-statistics';
import { isTradingDay } from '@/lib/pead/pead-scanner';

const PREFIX = '[PAIRS-TRACKER]';
const MAX_HOLDING_DAYS = 30;

export interface PairsTrackerResult {
  activeCount: number;
  closedToday: number;
  closedByReason: Record<string, number>;
  avgZScore: number;
}

/**
 * Run nightly pairs tracker — update all active positions.
 */
export async function runPairsTracker(): Promise<PairsTrackerResult> {
  const positions = await prisma.pairPosition.findMany({
    where: { status: 'active' },
    include: { formation: true },
  });

  let closedToday = 0;
  const closedByReason: Record<string, number> = {};
  let totalAbsZ = 0;
  let activeAfterUpdate = 0;
  const today = new Date();

  if (!isTradingDay(today)) {
    return { activeCount: positions.length, closedToday: 0, closedByReason: {}, avgZScore: 0 };
  }

  for (const pos of positions) {
    const newDays = pos.tradingDaysHeld + 1;

    // Time stop at day 30
    if (newDays >= MAX_HOLDING_DAYS) {
      const quote = await getStockQuote(pos.longTicker);
      await closePairsPosition(pos.id, 'time-stop', quote?.price);
      closedToday++;
      closedByReason['time-stop'] = (closedByReason['time-stop'] ?? 0) + 1;
      continue;
    }

    // Fetch current price for long leg
    const longQuote = await getStockQuote(pos.longTicker);
    if (!longQuote) {
      activeAfterUpdate++;
      continue;
    }

    // Calculate current z-score (simplified for long-only: use formation params)
    const currentSpread = longQuote.price - (pos.shortEntryPrice ?? pos.longEntryPrice);
    const z = getCurrentZScore(currentSpread, pos.formation.spreadMean, pos.formation.spreadStd);
    const absZ = Math.abs(z);
    totalAbsZ += absZ;

    // Stop-loss: |z| >= 4.0
    if (absZ >= STOP_ZSCORE) {
      await closePairsPosition(pos.id, 'stop-loss', longQuote.price);
      closedToday++;
      closedByReason['stop-loss'] = (closedByReason['stop-loss'] ?? 0) + 1;
      continue;
    }

    // Convergence: z crosses 0
    if (pos.entryZScore > 0 && z <= EXIT_ZSCORE) {
      await closePairsPosition(pos.id, 'convergence', longQuote.price);
      closedToday++;
      closedByReason['convergence'] = (closedByReason['convergence'] ?? 0) + 1;
      continue;
    }
    if (pos.entryZScore < 0 && z >= EXIT_ZSCORE) {
      await closePairsPosition(pos.id, 'convergence', longQuote.price);
      closedToday++;
      closedByReason['convergence'] = (closedByReason['convergence'] ?? 0) + 1;
      continue;
    }

    // Calculate P&L
    const longPnl = ((longQuote.price - pos.longEntryPrice) / pos.longEntryPrice) * 100;

    // Update position
    await prisma.pairPosition.update({
      where: { id: pos.id },
      data: {
        tradingDaysHeld: newDays,
        currentZScore: z,
        currentSpread: currentSpread,
      },
    });

    // Daily snapshot
    try {
      await prisma.pairDailySnapshot.create({
        data: {
          positionId: pos.id,
          date: today,
          tradingDay: newDays,
          zScore: z,
          spread: currentSpread,
          longPrice: longQuote.price,
          shortPrice: null,
          combinedPnlPct: longPnl,
        },
      });
    } catch {}

    console.log(
      `${PREFIX} ${pos.formation.ticker1}/${pos.formation.ticker2} day ${newDays}/${MAX_HOLDING_DAYS} zScore: ${z.toFixed(2)} → target: 0.0 stop: ±4.0`
    );

    activeAfterUpdate++;
  }

  const avgZ = activeAfterUpdate > 0 ? totalAbsZ / activeAfterUpdate : 0;

  // Summary
  const reasonSummary = Object.entries(closedByReason)
    .map(([r, c]) => `${c} ${r}`)
    .join(', ');
  console.log(
    `${PREFIX} ${activeAfterUpdate} open positions — ${closedToday} closed today (${reasonSummary || 'none'}) — avg zScore: ${avgZ.toFixed(1)}`
  );

  return { activeCount: activeAfterUpdate, closedToday, closedByReason, avgZScore: Math.round(avgZ * 10) / 10 };
}

/**
 * Close a pairs position.
 */
export async function closePairsPosition(
  positionId: number,
  reason: string,
  closePrice?: number | null
): Promise<void> {
  const pos = await prisma.pairPosition.findUnique({
    where: { id: positionId },
    include: { formation: true },
  });
  if (!pos) return;

  const price = closePrice ?? pos.longEntryPrice;
  const longPnl = ((price - pos.longEntryPrice) / pos.longEntryPrice) * 100;

  await prisma.$transaction(async (tx) => {
    await tx.pairPosition.update({
      where: { id: positionId },
      data: {
        status: 'closed',
        closeDate: new Date(),
        closeReason: reason,
        longClosePnlPct: longPnl,
        combinedPnlPct: longPnl, // long-only: combined = long
        currentZScore: null,
      },
    });
  });

  console.log(
    `${PREFIX} Closed ${pos.formation.ticker1}/${pos.formation.ticker2} — reason: ${reason}, P&L: ${longPnl >= 0 ? '+' : ''}${longPnl.toFixed(1)}%`
  );
}
