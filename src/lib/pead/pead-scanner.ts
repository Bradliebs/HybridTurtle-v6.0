// ============================================================
// PEAD Scanner — Post-Earnings Announcement Drift Detection
// ============================================================
//
// Identifies tickers with recent positive earnings surprises.
// Runs AFTER the main momentum scan completes. Completely
// separate pipeline with its own tables and sizing.
//
// Signal tiers:
//   surprisePct > 25% → conviction
//   surprisePct > 15% → strong
//   surprisePct > 5%  → weak
//   surprisePct ≤ 5%, negative, estimateEPS=0, actualEPS<0 → skip
//
// LSE: only strong + conviction (UK earnings data less reliable)
// ============================================================

import 'server-only';
import YahooFinance from 'yahoo-finance2';
import { toYahooTicker } from '@/lib/market-data';
import { withRetry } from '@/lib/fetch-retry';
import { getQualityScore } from '@/lib/quality-filter';
import prisma from '@/lib/prisma';

const PREFIX = '[PEAD-SCAN]';
const BATCH_DELAY_MS = 200;

// ── Types ──

export type SignalStrength = 'weak' | 'strong' | 'conviction';
export type PeadMarket = 'US' | 'LSE';

export interface PeadCandidate {
  ticker: string;
  market: PeadMarket;
  announcementDate: Date;
  announcementTiming: 'pre-market' | 'post-market';
  actualEPS: number;
  estimateEPS: number;
  surprisePct: number;
  signalStrength: SignalStrength;
  crossConfirmed: boolean;
  qualityTier: string;
  status: 'pending' | 'active' | 'skipped' | 'closed';
  skipReason?: string;
}

// ── Yahoo Finance instance ──

interface YFEarningsResult {
  earnings?: {
    earningsChart?: {
      quarterly?: Array<{
        date?: string;
        actual?: { raw?: number } | number;
        estimate?: { raw?: number } | number;
      }>;
    };
    financialsChart?: {
      quarterly?: Array<{
        date?: string;
        earnings?: { raw?: number } | number;
        revenue?: { raw?: number } | number;
      }>;
    };
  };
  calendarEvents?: {
    earningsDate?: Date[];
  };
  price?: {
    regularMarketVolume?: { raw?: number } | number;
    averageDailyVolume3Month?: { raw?: number } | number;
  };
  summaryProfile?: {
    sector?: string;
  };
}

interface YFInstance {
  quoteSummary(
    ticker: string,
    opts: { modules: string[] }
  ): Promise<YFEarningsResult | null>;
}

const yf = new (YahooFinance as unknown as new (opts: {
  suppressNotices: string[];
}) => YFInstance)({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// ── Helpers ──

function extractRaw(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  if (typeof val === 'object' && 'raw' in (val as Record<string, unknown>)) {
    const raw = (val as { raw?: number }).raw;
    return raw != null && isFinite(raw) ? raw : null;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a date is a trading day (Mon–Fri, excluding major US holidays).
 * Simplified: excludes weekends only; a full holiday calendar is out of scope.
 */
export function isTradingDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

/**
 * Count trading days between two dates (exclusive of start, inclusive of end).
 */
export function countTradingDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  while (d <= end) {
    if (isTradingDay(d)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// ── EPS Surprise Classification ──

export function calculateSurprise(
  actualEPS: number,
  estimateEPS: number
): { surprisePct: number; signalStrength: SignalStrength | null; skipReason: string | null } {
  if (estimateEPS === 0) {
    return { surprisePct: 0, signalStrength: null, skipReason: 'estimateEPS is zero' };
  }
  if (actualEPS < 0) {
    return { surprisePct: 0, signalStrength: null, skipReason: 'actualEPS negative (loss-making)' };
  }

  const surprisePct = ((actualEPS - estimateEPS) / Math.abs(estimateEPS)) * 100;

  if (surprisePct <= 5) {
    return { surprisePct, signalStrength: null, skipReason: `surprise ${surprisePct.toFixed(1)}% ≤ 5% threshold` };
  }

  let signalStrength: SignalStrength;
  if (surprisePct > 25) {
    signalStrength = 'conviction';
  } else if (surprisePct > 15) {
    signalStrength = 'strong';
  } else {
    signalStrength = 'weak';
  }

  return { surprisePct, signalStrength, skipReason: null };
}

// ── Volume check ──

const MIN_VOLUME_US = 500_000;
const MIN_VOLUME_LSE = 200_000;

function meetsVolumeThreshold(avgVolume: number | null, market: PeadMarket): boolean {
  if (avgVolume == null) return false;
  return market === 'US' ? avgVolume >= MIN_VOLUME_US : avgVolume >= MIN_VOLUME_LSE;
}

// ── Fetch earnings data for a single ticker ──

interface EarningsData {
  announcementDate: Date | null;
  announcementTiming: 'pre-market' | 'post-market';
  actualEPS: number | null;
  estimateEPS: number | null;
  avgVolume: number | null;
}

async function fetchEarningsData(ticker: string): Promise<EarningsData> {
  const yahooTicker = toYahooTicker(ticker);
  try {
    const result = await withRetry(
      () =>
        yf.quoteSummary(yahooTicker, {
          modules: ['earnings', 'calendarEvents', 'price'],
        }),
      `pead:${ticker}`
    );

    if (!result) {
      return { announcementDate: null, announcementTiming: 'pre-market', actualEPS: null, estimateEPS: null, avgVolume: null };
    }

    const quarterly = result.earnings?.earningsChart?.quarterly;
    if (!quarterly || quarterly.length === 0) {
      return { announcementDate: null, announcementTiming: 'pre-market', actualEPS: null, estimateEPS: null, avgVolume: null };
    }

    // Most recent quarter
    const latest = quarterly[quarterly.length - 1];
    const actualEPS = extractRaw(latest.actual);
    const estimateEPS = extractRaw(latest.estimate);

    // Use calendar events for announcement date
    const earningsDates = result.calendarEvents?.earningsDate;
    let announcementDate: Date | null = null;
    if (earningsDates && earningsDates.length > 0) {
      announcementDate = new Date(earningsDates[0]);
    }

    // Volume
    const avgVolume = extractRaw(result.price?.averageDailyVolume3Month);

    // Timing: default to pre-market (Yahoo doesn't reliably provide this)
    const announcementTiming: 'pre-market' | 'post-market' = 'pre-market';

    return { announcementDate, announcementTiming, actualEPS, estimateEPS, avgVolume };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${PREFIX} Earnings fetch failed for ${ticker}: ${msg}`);
    return { announcementDate: null, announcementTiming: 'pre-market', actualEPS: null, estimateEPS: null, avgVolume: null };
  }
}

// ── Determine market ──

function detectMarket(ticker: string): PeadMarket {
  // LSE tickers end with .L or l suffix
  if (ticker.endsWith('.L') || /^[A-Z]{2,5}l$/.test(ticker)) return 'LSE';
  return 'US';
}

// ── Main scan function ──

/**
 * Scan universe for PEAD candidates.
 * @param mainScanResults - tickers from today's main momentum scan (for cross-confirmation)
 * @param regimeOverride - if provided, skip getCombinedRiskGate call (for testing)
 */
export async function runPeadScan(
  mainScanResults: string[],
  regimeOverride?: string
): Promise<PeadCandidate[]> {
  // Check regime — block on crisis
  let regime = regimeOverride ?? 'normal';
  if (!regimeOverride) {
    try {
      const { getCombinedRiskGate } = await import('@/lib/combined-risk-gate');
      const gate = await getCombinedRiskGate();
      regime = gate.regime;
    } catch {
      console.warn(`${PREFIX} Could not check regime — proceeding with 'normal'`);
    }
  }

  if (regime === 'crisis') {
    console.log(`${PREFIX} Regime is crisis — suspending PEAD scan`);
    return [];
  }

  // Get active universe
  const stocks = await prisma.stock.findMany({
    where: { active: true },
    select: { ticker: true },
  });

  const crossSet = new Set(mainScanResults);
  const candidates: PeadCandidate[] = [];
  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 5); // 5 calendar days ≈ 3 trading days

  for (let i = 0; i < stocks.length; i++) {
    if (i > 0) await delay(BATCH_DELAY_MS);

    const ticker = stocks[i].ticker;
    const market = detectMarket(ticker);
    const data = await fetchEarningsData(ticker);

    // Skip if no announcement data or too old
    if (!data.announcementDate || data.announcementDate < threeDaysAgo) continue;
    if (data.actualEPS == null || data.estimateEPS == null) continue;

    // Volume check
    if (!meetsVolumeThreshold(data.avgVolume, market)) continue;

    // Calculate surprise
    const surprise = calculateSurprise(data.actualEPS, data.estimateEPS);
    if (!surprise.signalStrength) continue;

    // LSE restriction: only strong + conviction
    if (market === 'LSE' && surprise.signalStrength === 'weak') continue;

    // Quality check
    let qualityTier = 'unknown';
    try {
      const quality = await getQualityScore(ticker);
      qualityTier = quality.qualityTier;
    } catch {
      console.warn(`${PREFIX} Quality check failed for ${ticker} — defaulting to unknown`);
    }

    // Skip junk
    if (qualityTier === 'junk' || qualityTier === 'low') {
      // Record as skipped
      try {
        await prisma.peadCandidate.create({
          data: {
            ticker,
            market,
            announcementDate: data.announcementDate,
            announcementTiming: data.announcementTiming,
            actualEPS: data.actualEPS,
            estimateEPS: data.estimateEPS,
            surprisePct: surprise.surprisePct,
            signalStrength: surprise.signalStrength,
            crossConfirmed: crossSet.has(ticker),
            qualityTier,
            status: 'skipped',
            skipReason: `quality tier: ${qualityTier}`,
          },
        });
      } catch {}
      continue;
    }

    const candidate: PeadCandidate = {
      ticker,
      market,
      announcementDate: data.announcementDate,
      announcementTiming: data.announcementTiming,
      actualEPS: data.actualEPS,
      estimateEPS: data.estimateEPS,
      surprisePct: surprise.surprisePct,
      signalStrength: surprise.signalStrength,
      crossConfirmed: crossSet.has(ticker),
      qualityTier,
      status: 'pending',
    };

    // Persist
    try {
      await prisma.peadCandidate.create({
        data: {
          ticker: candidate.ticker,
          market: candidate.market,
          announcementDate: candidate.announcementDate,
          announcementTiming: candidate.announcementTiming,
          actualEPS: candidate.actualEPS,
          estimateEPS: candidate.estimateEPS,
          surprisePct: candidate.surprisePct,
          signalStrength: candidate.signalStrength,
          crossConfirmed: candidate.crossConfirmed,
          qualityTier: candidate.qualityTier,
          status: candidate.status,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} DB write failed for ${ticker}: ${msg}`);
    }

    candidates.push(candidate);
  }

  // Summary log
  const conviction = candidates.filter((c) => c.signalStrength === 'conviction').length;
  const strong = candidates.filter((c) => c.signalStrength === 'strong').length;
  const weak = candidates.filter((c) => c.signalStrength === 'weak').length;
  const crossCount = candidates.filter((c) => c.crossConfirmed).length;
  console.log(
    `${PREFIX} Found ${candidates.length} candidates (${conviction} conviction, ${strong} strong, ${weak} weak) — ${crossCount} cross-confirmed with momentum scan`
  );

  return candidates;
}

/**
 * Retrieve PEAD candidates created on a specific date.
 */
export async function getPeadCandidatesForDate(date: Date): Promise<PeadCandidate[]> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const rows = await prisma.peadCandidate.findMany({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: { not: 'skipped' },
    },
  });

  return rows.map((r) => ({
    ticker: r.ticker,
    market: r.market as PeadMarket,
    announcementDate: r.announcementDate,
    announcementTiming: r.announcementTiming as 'pre-market' | 'post-market',
    actualEPS: r.actualEPS,
    estimateEPS: r.estimateEPS,
    surprisePct: r.surprisePct,
    signalStrength: r.signalStrength as SignalStrength,
    crossConfirmed: r.crossConfirmed,
    qualityTier: r.qualityTier,
    status: r.status as PeadCandidate['status'],
    skipReason: r.skipReason ?? undefined,
  }));
}
