// ============================================================
// Quality / QMJ Filter — AQR Quality Minus Junk Pre-Filter
// ============================================================
//
// Screens tickers against three fundamental metrics from Yahoo
// Finance before momentum scoring begins. Prevents the engine
// from entering fundamentally broken companies.
//
// Metrics:
//   ROE > 10%          → +1 (profitability)
//   Debt/Equity < 1.5  → +1 (balance sheet)
//   Revenue Growth > 0 → +1 (fundamental momentum)
//
// Financial sector substitution:
//   Banks/insurers/REITs carry high D/E naturally.
//   → Skip debtToEquity, substitute returnOnAssets > 1%.
//
// Tiers:
//   3/3 → high   (multiplier 1.0)
//   2/3 → medium (multiplier 0.75)
//   1/3 → low    (multiplier 0.0, fail)
//   0/3 → junk   (multiplier 0.0, fail)
//   all missing → unknown (multiplier 0.5, pass)
// ============================================================

import 'server-only';
import YahooFinance from 'yahoo-finance2';
import { toYahooTicker } from '@/lib/market-data';
import { withRetry } from '@/lib/fetch-retry';
import {
  getCachedQuality,
  setCachedQuality,
  type QualityFilterResult,
} from '@/lib/quality-cache';

export type { QualityFilterResult } from '@/lib/quality-cache';

const PREFIX = '[QUALITY-FILTER]';
const WARN_PREFIX = '[QUALITY-FILTER-WARN]';
const BATCH_DELAY_MS = 200;

// yahoo-finance2 v3 instance — same pattern as market-data.ts
interface YFQuoteSummaryResult {
  defaultKeyStatistics?: {
    returnOnEquity?: { raw?: number } | number;
    returnOnAssets?: { raw?: number } | number;
  };
  financialData?: {
    returnOnEquity?: { raw?: number } | number;
    returnOnAssets?: { raw?: number } | number;
    debtToEquity?: { raw?: number } | number;
    revenueGrowth?: { raw?: number } | number;
  };
  summaryProfile?: {
    sector?: string;
  };
}

interface YFInstance {
  quoteSummary(
    ticker: string,
    opts: { modules: string[] }
  ): Promise<YFQuoteSummaryResult | null>;
}

const yf = new (YahooFinance as unknown as new (opts: {
  suppressNotices: string[];
}) => YFInstance)({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const FINANCIAL_SECTORS = new Set(['Financial Services', 'Real Estate']);

// ── Helpers ──

/** Extract a raw number from a Yahoo Finance field that may be { raw: n } or n */
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

// ── Scoring ──

interface RawFundamentals {
  roe: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  returnOnAssets: number | null;
  sector: string | null;
}

export function scoreQuality(
  ticker: string,
  f: RawFundamentals
): Omit<QualityFilterResult, 'fetchedAt'> {
  const isFinancialSector = f.sector != null && FINANCIAL_SECTORS.has(f.sector);

  // Count missing metrics
  const roePresent = f.roe != null;
  const revenuePresent = f.revenueGrowth != null;
  const thirdPresent = isFinancialSector
    ? f.returnOnAssets != null
    : f.debtToEquity != null;

  const missingCount = [roePresent, revenuePresent, thirdPresent].filter((p) => !p).length;

  // All three missing → unknown
  if (missingCount === 3) {
    console.warn(`${WARN_PREFIX} ${ticker}: all fundamental data missing — tier=unknown`);
    return {
      ticker,
      pass: true,
      qualityTier: 'unknown',
      qualityScore: 0,
      momentumScoreMultiplier: 0.5,
      roe: f.roe,
      debtToEquity: f.debtToEquity,
      revenueGrowth: f.revenueGrowth,
      isFinancialSector,
      dataComplete: false,
    };
  }

  // Score each metric: present → 0 or 1, missing → 0.5
  let score = 0;

  // Metric 1: ROE > 10%
  if (f.roe == null) {
    score += 0.5;
    console.warn(`${WARN_PREFIX} ${ticker}: ROE missing — scored as 0.5`);
  } else {
    score += f.roe > 0.10 ? 1 : 0;
  }

  // Metric 2: Revenue growth > 0
  if (f.revenueGrowth == null) {
    score += 0.5;
    console.warn(`${WARN_PREFIX} ${ticker}: revenueGrowth missing — scored as 0.5`);
  } else {
    score += f.revenueGrowth > 0 ? 1 : 0;
  }

  // Metric 3: D/E < 1.5 (or ROA > 1% for financials)
  if (isFinancialSector) {
    if (f.returnOnAssets == null) {
      score += 0.5;
      console.warn(`${WARN_PREFIX} ${ticker}: returnOnAssets missing (financial sector) — scored as 0.5`);
    } else {
      score += f.returnOnAssets > 0.01 ? 1 : 0;
    }
  } else {
    if (f.debtToEquity == null) {
      score += 0.5;
      console.warn(`${WARN_PREFIX} ${ticker}: debtToEquity missing — scored as 0.5`);
    } else {
      score += f.debtToEquity < 1.5 ? 1 : 0;
    }
  }

  // Round to nearest integer for tier bucketing (0.5 missing → rounds to nearest)
  const roundedScore = Math.round(score);
  const dataComplete = missingCount === 0;

  let qualityTier: QualityFilterResult['qualityTier'];
  let momentumScoreMultiplier: number;
  let pass: boolean;

  if (roundedScore >= 3) {
    qualityTier = 'high';
    momentumScoreMultiplier = 1.0;
    pass = true;
  } else if (roundedScore >= 2) {
    qualityTier = 'medium';
    momentumScoreMultiplier = 0.75;
    pass = true;
  } else if (roundedScore >= 1) {
    qualityTier = 'low';
    momentumScoreMultiplier = 0.0;
    pass = false;
  } else {
    qualityTier = 'junk';
    momentumScoreMultiplier = 0.0;
    pass = false;
  }

  return {
    ticker,
    pass,
    qualityTier,
    qualityScore: roundedScore,
    momentumScoreMultiplier,
    roe: f.roe,
    debtToEquity: f.debtToEquity,
    revenueGrowth: f.revenueGrowth,
    isFinancialSector,
    dataComplete,
  };
}

// ── Yahoo Finance fetch ──

async function fetchFundamentals(ticker: string): Promise<RawFundamentals> {
  const yahooTicker = toYahooTicker(ticker);
  try {
    const result = await withRetry(
      () =>
        yf.quoteSummary(yahooTicker, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryProfile'],
        }),
      `quality:${ticker}`
    );

    if (!result) {
      console.warn(`${WARN_PREFIX} ${ticker}: quoteSummary returned null`);
      return { roe: null, debtToEquity: null, revenueGrowth: null, returnOnAssets: null, sector: null };
    }

    const fd = result.financialData;
    const ks = result.defaultKeyStatistics;

    // ROE: try financialData first, fall back to defaultKeyStatistics
    const roe = extractRaw(fd?.returnOnEquity) ?? extractRaw(ks?.returnOnEquity);
    const debtToEquity = extractRaw(fd?.debtToEquity);
    const revenueGrowth = extractRaw(fd?.revenueGrowth);
    const returnOnAssets = extractRaw(fd?.returnOnAssets) ?? extractRaw(ks?.returnOnAssets);
    const sector = result.summaryProfile?.sector ?? null;

    return { roe, debtToEquity, revenueGrowth, returnOnAssets, sector };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${PREFIX} Fetch failed for ${ticker}: ${msg}`);
    return { roe: null, debtToEquity: null, revenueGrowth: null, returnOnAssets: null, sector: null };
  }
}

// ── Public API ──

/**
 * Get quality score for a single ticker.
 * Checks cache first; fetches from Yahoo only if cache is stale.
 */
export async function getQualityScore(
  ticker: string,
  forceRefresh = false
): Promise<QualityFilterResult> {
  if (!forceRefresh) {
    const cached = await getCachedQuality(ticker);
    if (cached) return cached;
  }

  const fundamentals = await fetchFundamentals(ticker);
  const scored = scoreQuality(ticker, fundamentals);
  const result: QualityFilterResult = { ...scored, fetchedAt: new Date() };

  // Persist to cache (fire-and-forget — don't block on DB write)
  setCachedQuality(result).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${PREFIX} Cache write failed for ${ticker}: ${msg}`);
  });

  return result;
}

/**
 * Get quality scores for a batch of tickers.
 * Uses cache aggressively — only calls Yahoo for uncached/stale tickers.
 * Includes mandatory 200ms delay between Yahoo calls.
 */
export async function getQualityScoreBatch(
  tickers: string[],
  forceRefresh = false
): Promise<QualityFilterResult[]> {
  const results: QualityFilterResult[] = [];
  const toFetch: string[] = [];

  // Phase 1: populate from cache
  if (!forceRefresh) {
    for (const ticker of tickers) {
      const cached = await getCachedQuality(ticker);
      if (cached) {
        results.push(cached);
      } else {
        toFetch.push(ticker);
      }
    }
  } else {
    toFetch.push(...tickers);
  }

  console.log(
    `${PREFIX} Batch: ${tickers.length} tickers, ${results.length} cached, ${toFetch.length} to fetch`
  );

  // Phase 2: fetch uncached tickers with rate limiting
  for (let i = 0; i < toFetch.length; i++) {
    if (i > 0) await delay(BATCH_DELAY_MS);

    const ticker = toFetch[i];
    const fundamentals = await fetchFundamentals(ticker);
    const scored = scoreQuality(ticker, fundamentals);
    const result: QualityFilterResult = { ...scored, fetchedAt: new Date() };

    setCachedQuality(result).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} Cache write failed for ${ticker}: ${msg}`);
    });

    results.push(result);
  }

  return results;
}

// ── Conviction Bonus ──

/**
 * Position-size bonus when BOTH VolumeTurtle and HBME signals converge
 * on a quality ticker. Returns an additive multiplier (0.0–0.15).
 */
export function getConvictionBonus(
  qualityTier: string,
  isConverged: boolean
): number {
  if (!isConverged) return 0.0;
  if (qualityTier === 'high') return 0.15;
  if (qualityTier === 'medium') return 0.05;
  return 0.0;
}
