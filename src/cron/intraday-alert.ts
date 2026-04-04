/**
 * DEPENDENCIES
 * Consumed by: intraday-alert-task.bat, scripts/run-intraday-alert.ts, Windows Task Scheduler
 * Consumes: auto-stop-service.ts (runAutoStopCycle), market-data.ts (getBatchPrices),
 *           telegram.ts (sendTelegramMessage), prisma.ts
 * Risk-sensitive: YES — auto-applies stops via runAutoStopCycle (monotonic enforcement inherited)
 * Last modified: 2026-04-04
 * Notes: Intraday alert — checks live prices against signal triggers and auto-applies stops.
 *        Sends a focused Telegram summary at 15:30 UK time.
 *        Does NOT modify stop-manager.ts or any sacred files.
 *        Stops are applied via runAutoStopCycle() which honours monotonic enforcement.
 */

import prisma from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/telegram';
import { getBatchPrices } from '@/lib/market-data';
import { runAutoStopCycle } from '@/lib/auto-stop-service';
import type { AutoStopResult, AutoStopDetail } from '@/lib/auto-stop-service';

// ── Types ───────────────────────────────────────────────────────────

interface TriggerHit {
  ticker: string;
  name: string;
  sleeve: string;
  livePrice: number;
  triggerPrice: number;
  stopLevel: number;
  distancePct: number;
  currency: string;
}

export interface IntradayAlertResult {
  candidatesChecked: number;
  triggersHit: TriggerHit[];
  stopResult: AutoStopResult;
  telegramSent: boolean;
  skippedReason?: string;
}

// ── Main function ───────────────────────────────────────────────────

export async function runIntradayAlert(): Promise<IntradayAlertResult> {
  const userId = 'default-user';

  console.log('========================================');
  console.log(`[HybridTurtle] Intraday alert started at ${new Date().toISOString()}`);
  console.log('========================================');

  // Skip weekends (UK time)
  const ukDay = getUKDayOfWeek();
  if (ukDay === 0 || ukDay === 6) {
    console.log('  Weekend — skipping alert.');
    await prisma.heartbeat.create({
      data: {
        status: 'SKIPPED',
        details: JSON.stringify({ type: 'intraday-alert', reason: 'weekend', ranAt: new Date().toISOString() }),
      },
    });
    return { candidatesChecked: 0, triggersHit: [], stopResult: { enabled: false, positionsChecked: 0, stopsUpdated: 0, t212Pushed: 0, t212Failed: 0, skipped: 0, errors: [], details: [] }, telegramSent: false, skippedReason: 'weekend' };
  }

  // ── 1. Get trigger-met candidates from latest snapshot ──
  console.log('  [1] Checking signal triggers against live prices...');
  const triggersHit = await detectTriggerHits(userId);
  console.log(`      ${triggersHit.length} trigger(s) hit out of candidates checked`);

  // ── 2. Auto-apply stops (reuses existing auto-stop service) ──
  console.log('  [2] Running auto-stop ratchet cycle...');
  let stopResult: AutoStopResult;
  try {
    stopResult = await runAutoStopCycle(userId);
    console.log(`      Stops: ${stopResult.stopsUpdated} updated, ${stopResult.t212Pushed} T212 pushed, ${stopResult.t212Failed} failed, ${stopResult.skipped} skipped`);
  } catch (err) {
    console.error(`      Auto-stop cycle failed: ${(err as Error).message}`);
    stopResult = { enabled: false, positionsChecked: 0, stopsUpdated: 0, t212Pushed: 0, t212Failed: 0, skipped: 0, errors: [(err as Error).message], details: [] };
  }

  // ── 3. Send Telegram summary ──
  console.log('  [3] Sending Telegram alert...');
  const message = formatIntradayMessage(triggersHit, stopResult);
  const telegramSent = await sendTelegramMessage({ text: message, parseMode: 'HTML' });
  console.log(`      Telegram: ${telegramSent ? 'sent' : 'FAILED'}`);

  // ── 4. Write heartbeat ──
  await prisma.heartbeat.create({
    data: {
      status: stopResult.errors.length > 0 ? 'PARTIAL' : 'OK',
      details: JSON.stringify({
        type: 'intraday-alert',
        ranAt: new Date().toISOString(),
        triggersHit: triggersHit.length,
        stopsUpdated: stopResult.stopsUpdated,
        t212Pushed: stopResult.t212Pushed,
        t212Failed: stopResult.t212Failed,
        errors: stopResult.errors,
      }),
    },
  });

  console.log('========================================');
  console.log(`[HybridTurtle] Intraday alert finished at ${new Date().toISOString()}`);
  console.log('========================================');

  return {
    candidatesChecked: triggersHit.length, // updated below
    triggersHit,
    stopResult,
    telegramSent,
  };
}

// ── Trigger detection ───────────────────────────────────────────────

async function detectTriggerHits(userId: string): Promise<TriggerHit[]> {
  // Get the latest snapshot
  const latestSnapshot = await prisma.snapshot.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!latestSnapshot) {
    console.log('      No snapshot found — skipping trigger check.');
    return [];
  }

  // Get held tickers to exclude
  const heldPositions = await prisma.position.findMany({
    where: { userId, status: 'OPEN' },
    select: { stock: { select: { ticker: true } } },
  });
  const heldTickers = new Set(heldPositions.map((p) => p.stock.ticker));

  // Get READY/WATCH candidates from latest snapshot
  const candidates = await prisma.snapshotTicker.findMany({
    where: {
      snapshotId: latestSnapshot.id,
      status: { in: ['READY', 'WATCH'] },
      entryTrigger: { gt: 0 },
      adx14: { gte: 20 },
    },
    orderBy: { distanceTo20dHighPct: 'asc' },
  });

  // Filter out held tickers
  const eligibleCandidates = candidates.filter((c) => !heldTickers.has(c.ticker));

  if (eligibleCandidates.length === 0) {
    console.log('      No eligible candidates to check.');
    return [];
  }

  // Fetch live prices
  const tickers = eligibleCandidates.map((c) => c.ticker);
  console.log(`      Fetching live prices for ${tickers.length} candidates...`);
  const livePrices = await getBatchPrices(tickers, true);

  // Check which have hit their trigger
  const hits: TriggerHit[] = [];
  for (const c of eligibleCandidates) {
    const livePrice = livePrices[c.ticker];
    if (livePrice && livePrice >= c.entryTrigger) {
      hits.push({
        ticker: c.ticker,
        name: c.name || c.ticker,
        sleeve: c.sleeve || 'CORE',
        livePrice,
        triggerPrice: c.entryTrigger,
        stopLevel: c.stopLevel,
        distancePct: ((livePrice - c.entryTrigger) / c.entryTrigger) * 100,
        currency: c.currency || 'USD',
      });
    }
  }

  return hits;
}

// ── Telegram message formatting ─────────────────────────────────────

function currencySymbol(currency: string): string {
  return currency === 'GBP' || currency === 'GBX' ? '£' : currency === 'EUR' ? '€' : '$';
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatIntradayMessage(triggersHit: TriggerHit[], stopResult: AutoStopResult): string {
  const now = new Date();
  const ukTime = now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const ukDate = now.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const lines: string[] = [];

  lines.push('🐢 <b>HybridTurtle Intraday Alert</b>');
  lines.push(`${ukTime} — ${ukDate}`);
  lines.push('');

  // ── Triggers Hit ──
  if (triggersHit.length > 0) {
    lines.push(`━━━ 🎯 <b>Triggers Hit (${triggersHit.length})</b> ━━━`);
    for (const t of triggersHit) {
      const cs = currencySymbol(t.currency);
      lines.push(
        `  <b>${escapeHtml(t.ticker)}</b> ${cs}${t.livePrice.toFixed(2)} | Trigger: ${cs}${t.triggerPrice.toFixed(2)} | Stop: ${cs}${t.stopLevel.toFixed(2)} | +${t.distancePct.toFixed(1)}%`
      );
    }
    lines.push('');
  }

  // ── Stops Applied ──
  const appliedStops = stopResult.details.filter((d) => d.dbApplied);
  if (appliedStops.length > 0) {
    lines.push(`━━━ 🔒 <b>Stops Applied (${appliedStops.length})</b> ━━━`);
    for (const s of appliedStops) {
      const t212Status = s.t212Applied ? '✅ T212' : '⚠️ DB only';
      lines.push(
        `  <b>${escapeHtml(s.ticker)}</b> ${s.currentStop.toFixed(2)} → ${s.newStop.toFixed(2)} | ${escapeHtml(s.reason)} | ${t212Status}`
      );
    }
    lines.push('');
  }

  // ── T212 Failures ──
  const failedStops = stopResult.details.filter((d) => d.error && !d.t212Applied && d.dbApplied);
  if (failedStops.length > 0) {
    lines.push(`━━━ ⚠️ <b>T212 Push Failed (${failedStops.length})</b> ━━━`);
    for (const f of failedStops) {
      lines.push(`  <b>${escapeHtml(f.ticker)}</b> ${f.error ? escapeHtml(f.error) : 'unknown error'}`);
    }
    lines.push('');
  }

  // ── Summary (always shown) ──
  lines.push('━━━ 📊 <b>Summary</b> ━━━');
  lines.push(`  Triggers hit: ${triggersHit.length}`);
  lines.push(`  Stops updated: ${stopResult.stopsUpdated} | T212 pushed: ${stopResult.t212Pushed} | Failed: ${stopResult.t212Failed}`);
  lines.push(`  Positions checked: ${stopResult.positionsChecked} | Skipped: ${stopResult.skipped}`);

  if (stopResult.errors.length > 0) {
    lines.push(`  Errors: ${stopResult.errors.length}`);
  }

  // If nothing happened, add an easy visual
  if (triggersHit.length === 0 && appliedStops.length === 0) {
    lines.push('');
    lines.push('✅ All quiet — no triggers hit, no stop updates needed.');
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────

function getUKDayOfWeek(): number {
  const now = new Date();
  const ukTime = new Date(
    now.toLocaleString('en-GB', { timeZone: 'Europe/London' })
  );
  return ukTime.getDay();
}

// ── Entry point (when run directly via tsx) ─────────────────────────
// Only self-execute when this cron file is the direct entry (not imported by scripts/)
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('src/cron/intraday-alert');
if (isDirectRun) {
  runIntradayAlert()
    .then((result) => {
      console.log('\nResult:', JSON.stringify({
        triggersHit: result.triggersHit.length,
        stopsUpdated: result.stopResult.stopsUpdated,
        t212Pushed: result.stopResult.t212Pushed,
        telegramSent: result.telegramSent,
      }, null, 2));
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error('Fatal error in intraday alert:', err);
      process.exit(1);
    });
}
