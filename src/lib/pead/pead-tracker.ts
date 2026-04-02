// ============================================================
// PEAD Tracker — Manages Open PEAD Positions Nightly
// ============================================================
//
// Monitors drift, ratchets stops, closes positions when rules
// trigger. Runs nightly after pead-scanner.ts completes.
//
// Stop ratchet schedule:
//   Day 0–9:   initial stop (entry - 1.5×ATR14)
//   Day 10:    if profitable → stop to breakeven
//   Day 20:    if up >10% → stop to entry + 5%
//   Day 40:    tighten to entry + max(0, currentGain - 5%)
//   Day 60:    close unconditionally
// ============================================================

import 'server-only';
import { getStockQuote, getDailyPrices } from '@/lib/market-data';
import { getQualityScore } from '@/lib/quality-filter';
import prisma from '@/lib/prisma';
import { isTradingDay } from './pead-scanner';

const PREFIX = '[PEAD-TRACKER]';

export interface PeadTrackerResult {
  activeCount: number;
  closedToday: number;
  closedByReason: Record<string, number>;
  avgDriftPct: number;
}

// ── ATR calculation ──

function calculateATR(bars: { high: number; low: number; close: number }[], period = 14): number {
  if (bars.length < period + 1) return 0;
  let atrSum = 0;
  for (let i = 0; i < period; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i + 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atrSum += tr;
  }
  return atrSum / period;
}

// ── Stop ratchet logic ──

export function calculateStop(
  entryPrice: number,
  currentPrice: number,
  tradingDaysHeld: number,
  initialStop: number
): { stopPrice: number; ratchetReason: string } {
  const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  if (tradingDaysHeld >= 40) {
    const dynamicStop = entryPrice * (1 + Math.max(0, gainPct - 5) / 100);
    const stopPrice = Math.max(dynamicStop, initialStop);
    return { stopPrice, ratchetReason: 'day-40-tighten' };
  }

  if (tradingDaysHeld >= 20 && gainPct > 10) {
    const stopPrice = entryPrice * 1.05;
    return { stopPrice, ratchetReason: 'day-20-lock-profit' };
  }

  if (tradingDaysHeld >= 10 && currentPrice > entryPrice) {
    return { stopPrice: entryPrice, ratchetReason: 'day-10-breakeven' };
  }

  return { stopPrice: initialStop, ratchetReason: 'initial' };
}

/**
 * Run the nightly PEAD tracker — update all active positions.
 */
export async function runPeadTracker(): Promise<PeadTrackerResult> {
  const activePositions = await prisma.peadPosition.findMany({
    where: { status: 'active' },
    include: { candidate: true },
  });

  let closedToday = 0;
  const closedByReason: Record<string, number> = {};
  let totalDrift = 0;
  let activeAfterUpdate = 0;

  for (const pos of activePositions) {
    // Increment trading days
    const today = new Date();
    if (!isTradingDay(today)) continue;
    const newTradingDays = pos.tradingDaysHeld + 1;

    // Day 60 — close unconditionally
    if (newTradingDays >= 60) {
      const quote = await getStockQuote(pos.candidate.ticker);
      const closePrice = quote?.price ?? pos.currentPrice ?? pos.entryPrice;
      await closePeadPosition(pos.id, 'max-holding-period', closePrice);
      closedToday++;
      closedByReason['max-holding-period'] = (closedByReason['max-holding-period'] ?? 0) + 1;
      continue;
    }

    // Fetch current price
    const quote = await getStockQuote(pos.candidate.ticker);
    if (!quote) {
      console.warn(`${PREFIX} Could not get price for ${pos.candidate.ticker} — skipping update`);
      activeAfterUpdate++;
      continue;
    }
    const currentPrice = quote.price;
    const driftPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    totalDrift += driftPct;

    // Quality deterioration check (weekly)
    if (newTradingDays % 5 === 0) {
      try {
        const quality = await getQualityScore(pos.candidate.ticker, true);
        if (quality.qualityTier === 'junk') {
          await closePeadPosition(pos.id, 'quality-deterioration', currentPrice);
          closedToday++;
          closedByReason['quality-deterioration'] = (closedByReason['quality-deterioration'] ?? 0) + 1;
          continue;
        }
      } catch {
        // Quality check failed — don't close, just warn
        console.warn(`${PREFIX} Quality recheck failed for ${pos.candidate.ticker}`);
      }
    }

    // Calculate stop
    const { stopPrice: newStop, ratchetReason } = calculateStop(
      pos.entryPrice,
      currentPrice,
      newTradingDays,
      pos.stopPrice
    );

    // Never lower the stop
    const effectiveStop = Math.max(newStop, pos.stopPrice);

    // Stop hit check
    if (currentPrice <= effectiveStop) {
      await closePeadPosition(pos.id, 'stop-hit', currentPrice);
      closedToday++;
      closedByReason['stop-hit'] = (closedByReason['stop-hit'] ?? 0) + 1;
      continue;
    }

    // Update position
    await prisma.peadPosition.update({
      where: { id: pos.id },
      data: {
        tradingDaysHeld: newTradingDays,
        currentPrice,
        currentDriftPct: driftPct,
        stopPrice: effectiveStop,
      },
    });

    // Daily snapshot
    try {
      await prisma.peadDailySnapshot.create({
        data: {
          positionId: pos.id,
          date: today,
          tradingDay: newTradingDays,
          price: currentPrice,
          driftPct,
          stopPrice: effectiveStop,
        },
      });
    } catch {}

    console.log(
      `${PREFIX} ${pos.candidate.ticker} day ${newTradingDays}/60 drift: ${driftPct >= 0 ? '+' : ''}${driftPct.toFixed(1)}% stop: ${effectiveStop.toFixed(2)} [${ratchetReason}]`
    );

    activeAfterUpdate++;
  }

  const avgDrift = activeAfterUpdate > 0 ? totalDrift / activeAfterUpdate : 0;

  // Summary
  const reasonSummary = Object.entries(closedByReason)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');

  console.log(
    `${PREFIX} ${activeAfterUpdate} active positions — ${closedToday} closed today (${reasonSummary || 'none'}) — avg drift: ${avgDrift >= 0 ? '+' : ''}${avgDrift.toFixed(1)}%`
  );

  return {
    activeCount: activeAfterUpdate,
    closedToday,
    closedByReason,
    avgDriftPct: Math.round(avgDrift * 10) / 10,
  };
}

/**
 * Close a PEAD position with reason and P&L calculation.
 */
export async function closePeadPosition(
  positionId: number,
  reason: string,
  closePrice: number
): Promise<void> {
  const pos = await prisma.peadPosition.findUnique({
    where: { id: positionId },
    include: { candidate: true },
  });
  if (!pos) return;

  const pnlPct = ((closePrice - pos.entryPrice) / pos.entryPrice) * 100;
  const pnlAbsolute = pos.sharesHeld
    ? (closePrice - pos.entryPrice) * pos.sharesHeld
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.peadPosition.update({
      where: { id: positionId },
      data: {
        status: 'closed',
        closeDate: new Date(),
        closePrice,
        closeReason: reason,
        pnlPct,
        pnlAbsolute,
        currentPrice: closePrice,
        currentDriftPct: pnlPct,
      },
    });

    await tx.peadCandidate.update({
      where: { id: pos.candidateId },
      data: { status: 'closed' },
    });
  });

  console.log(
    `${PREFIX} Closed ${pos.candidate.ticker} — reason: ${reason}, P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`
  );
}
