// ============================================================
// Quality Cache — 7-day DB cache for QualitySnapshot
// ============================================================
//
// Fundamentals don't change daily. Cache quality scores in the
// database and only re-fetch from Yahoo Finance when the cache
// is older than 7 days.
// ============================================================

import prisma from '@/lib/prisma';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface QualityFilterResult {
  ticker: string;
  pass: boolean;
  qualityTier: 'high' | 'medium' | 'low' | 'junk' | 'unknown';
  qualityScore: number;
  momentumScoreMultiplier: number;
  roe: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  isFinancialSector: boolean;
  dataComplete: boolean;
  fetchedAt: Date;
}

/**
 * Check if this ticker's cached quality score is stale (>7 days old or missing).
 */
export async function isQualityCacheStale(ticker: string): Promise<boolean> {
  const latest = await prisma.qualitySnapshot.findFirst({
    where: { ticker },
    orderBy: { fetchedAt: 'desc' },
    select: { expiresAt: true },
  });
  if (!latest) return true;
  return new Date() > latest.expiresAt;
}

/**
 * Retrieve the most recent non-expired quality score from the DB cache.
 * Returns null if there is no cached entry or it has expired.
 */
export async function getCachedQuality(ticker: string): Promise<QualityFilterResult | null> {
  const now = new Date();
  const row = await prisma.qualitySnapshot.findFirst({
    where: {
      ticker,
      expiresAt: { gt: now },
    },
    orderBy: { fetchedAt: 'desc' },
  });

  if (!row) return null;

  return {
    ticker: row.ticker,
    pass: row.pass,
    qualityTier: row.qualityTier as QualityFilterResult['qualityTier'],
    qualityScore: row.qualityScore,
    momentumScoreMultiplier: row.momentumScoreMultiplier,
    roe: row.roe,
    debtToEquity: row.debtToEquity,
    revenueGrowth: row.revenueGrowth,
    isFinancialSector: row.isFinancialSector,
    dataComplete: row.dataComplete,
    fetchedAt: row.fetchedAt,
  };
}

/**
 * Persist a quality score to the DB cache with a 7-day TTL.
 */
export async function setCachedQuality(result: QualityFilterResult): Promise<void> {
  const expiresAt = new Date(result.fetchedAt.getTime() + CACHE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.qualitySnapshot.create({
      data: {
        ticker: result.ticker,
        fetchedAt: result.fetchedAt,
        expiresAt,
        roe: result.roe,
        debtToEquity: result.debtToEquity,
        revenueGrowth: result.revenueGrowth,
        returnOnAssets: null, // stored separately if financial
        isFinancialSector: result.isFinancialSector,
        qualityScore: result.qualityScore,
        qualityTier: result.qualityTier,
        momentumScoreMultiplier: result.momentumScoreMultiplier,
        pass: result.pass,
        dataComplete: result.dataComplete,
      },
    });
  });
}
