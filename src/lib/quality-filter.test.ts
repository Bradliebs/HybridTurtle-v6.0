import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreQuality, getConvictionBonus } from './quality-filter';

// ============================================================
// scoreQuality — pure scoring function (no mocks needed)
// ============================================================

describe('scoreQuality — scoring tiers', () => {
  it('3/3 metrics pass → high tier, multiplier 1.0', () => {
    const result = scoreQuality('AAPL', {
      roe: 0.30,
      debtToEquity: 0.5,
      revenueGrowth: 0.10,
      returnOnAssets: null,
      sector: 'Technology',
    });
    expect(result.qualityTier).toBe('high');
    expect(result.qualityScore).toBe(3);
    expect(result.momentumScoreMultiplier).toBe(1.0);
    expect(result.pass).toBe(true);
    expect(result.dataComplete).toBe(true);
  });

  it('2/3 metrics pass → medium tier, multiplier 0.75', () => {
    const result = scoreQuality('MSFT', {
      roe: 0.30,
      debtToEquity: 0.5,
      revenueGrowth: -0.05, // fails
      returnOnAssets: null,
      sector: 'Technology',
    });
    expect(result.qualityTier).toBe('medium');
    expect(result.qualityScore).toBe(2);
    expect(result.momentumScoreMultiplier).toBe(0.75);
    expect(result.pass).toBe(true);
  });

  it('1/3 metrics pass → low tier, multiplier 0.0, fail', () => {
    const result = scoreQuality('JUNK1', {
      roe: 0.02, // fails (< 10%)
      debtToEquity: 3.0, // fails (> 1.5)
      revenueGrowth: 0.05, // passes
      returnOnAssets: null,
      sector: 'Technology',
    });
    expect(result.qualityTier).toBe('low');
    expect(result.qualityScore).toBe(1);
    expect(result.momentumScoreMultiplier).toBe(0.0);
    expect(result.pass).toBe(false);
  });

  it('0/3 metrics pass → junk tier, multiplier 0.0, fail', () => {
    const result = scoreQuality('JUNK2', {
      roe: -0.10,
      debtToEquity: 5.0,
      revenueGrowth: -0.20,
      returnOnAssets: null,
      sector: 'Technology',
    });
    expect(result.qualityTier).toBe('junk');
    expect(result.qualityScore).toBe(0);
    expect(result.momentumScoreMultiplier).toBe(0.0);
    expect(result.pass).toBe(false);
  });
});

describe('scoreQuality — missing data handling', () => {
  it('ROE missing → scored as 0.5 (neutral)', () => {
    const result = scoreQuality('MISS1', {
      roe: null,
      debtToEquity: 0.5,    // pass
      revenueGrowth: 0.10,  // pass
      returnOnAssets: null,
      sector: 'Technology',
    });
    // 0.5 + 1 + 1 = 2.5 → rounds to 3 → high
    expect(result.qualityScore).toBe(3);
    expect(result.qualityTier).toBe('high');
    expect(result.dataComplete).toBe(false);
    expect(result.pass).toBe(true);
  });

  it('debtToEquity missing → scored as 0.5 (neutral)', () => {
    const result = scoreQuality('MISS2', {
      roe: 0.30,            // pass
      debtToEquity: null,
      revenueGrowth: 0.10,  // pass
      returnOnAssets: null,
      sector: 'Technology',
    });
    // 1 + 1 + 0.5 = 2.5 → rounds to 3 → high
    expect(result.qualityScore).toBe(3);
    expect(result.dataComplete).toBe(false);
  });

  it('revenueGrowth missing → scored as 0.5 (neutral)', () => {
    const result = scoreQuality('MISS3', {
      roe: 0.30,            // pass
      debtToEquity: 0.5,    // pass
      revenueGrowth: null,
      returnOnAssets: null,
      sector: 'Technology',
    });
    // 1 + 0.5 + 1 = 2.5 → rounds to 3 → high
    expect(result.qualityScore).toBe(3);
    expect(result.dataComplete).toBe(false);
  });

  it('all three missing → unknown tier, multiplier 0.5, pass', () => {
    const result = scoreQuality('GHOST', {
      roe: null,
      debtToEquity: null,
      revenueGrowth: null,
      returnOnAssets: null,
      sector: 'Technology',
    });
    expect(result.qualityTier).toBe('unknown');
    expect(result.qualityScore).toBe(0);
    expect(result.momentumScoreMultiplier).toBe(0.5);
    expect(result.pass).toBe(true);
    expect(result.dataComplete).toBe(false);
  });

  it('two missing, one fails → rounds to 1 → low/fail', () => {
    const result = scoreQuality('SPARSE', {
      roe: null,             // 0.5
      debtToEquity: null,    // 0.5 (non-financial)
      revenueGrowth: -0.05,  // 0
      returnOnAssets: null,
      sector: 'Technology',
    });
    // 0.5 + 0 + 0.5 = 1.0 → rounds to 1 → low
    expect(result.qualityScore).toBe(1);
    expect(result.qualityTier).toBe('low');
    expect(result.pass).toBe(false);
  });
});

describe('scoreQuality — financial sector substitution', () => {
  it('financial sector: skips debtToEquity, uses returnOnAssets instead', () => {
    const result = scoreQuality('JPM', {
      roe: 0.15,              // pass
      debtToEquity: 10.0,     // ignored for financials
      revenueGrowth: 0.05,    // pass
      returnOnAssets: 0.02,   // pass (> 1%)
      sector: 'Financial Services',
    });
    expect(result.isFinancialSector).toBe(true);
    expect(result.qualityTier).toBe('high');
    expect(result.qualityScore).toBe(3);
    expect(result.pass).toBe(true);
  });

  it('Real Estate sector also triggers financial substitution', () => {
    const result = scoreQuality('O', {
      roe: 0.05,              // fails
      debtToEquity: 8.0,      // ignored
      revenueGrowth: 0.03,    // pass
      returnOnAssets: 0.015,  // pass (> 1%)
      sector: 'Real Estate',
    });
    expect(result.isFinancialSector).toBe(true);
    // ROE fails, revenue passes, ROA passes → 2/3 → medium
    expect(result.qualityScore).toBe(2);
    expect(result.qualityTier).toBe('medium');
  });

  it('financial with low ROA → fails that metric', () => {
    const result = scoreQuality('BANK', {
      roe: 0.15,              // pass
      debtToEquity: 12.0,     // ignored
      revenueGrowth: -0.10,   // fail
      returnOnAssets: 0.005,  // fail (< 1%)
      sector: 'Financial Services',
    });
    // 1 + 0 + 0 = 1 → low
    expect(result.qualityScore).toBe(1);
    expect(result.qualityTier).toBe('low');
    expect(result.pass).toBe(false);
  });

  it('financial with missing returnOnAssets → scored as 0.5', () => {
    const result = scoreQuality('FIN1', {
      roe: 0.20,              // pass
      debtToEquity: 15.0,     // ignored
      revenueGrowth: 0.08,    // pass
      returnOnAssets: null,   // missing → 0.5
      sector: 'Financial Services',
    });
    // 1 + 1 + 0.5 = 2.5 → rounds to 3 → high
    expect(result.qualityScore).toBe(3);
    expect(result.isFinancialSector).toBe(true);
    expect(result.dataComplete).toBe(false);
  });

  it('non-financial ignores returnOnAssets, uses debtToEquity', () => {
    const result = scoreQuality('TECH', {
      roe: 0.25,
      debtToEquity: 2.0,     // fails (>= 1.5)
      revenueGrowth: 0.15,
      returnOnAssets: 0.10,  // ignored for non-financial
      sector: 'Technology',
    });
    expect(result.isFinancialSector).toBe(false);
    // ROE pass, D/E fail, revenue pass → 2/3 → medium
    expect(result.qualityScore).toBe(2);
    expect(result.qualityTier).toBe('medium');
  });
});

// ============================================================
// getConvictionBonus — all tier × convergence combos
// ============================================================

describe('getConvictionBonus', () => {
  it('high + converged → 0.15', () => {
    expect(getConvictionBonus('high', true)).toBe(0.15);
  });

  it('medium + converged → 0.05', () => {
    expect(getConvictionBonus('medium', true)).toBe(0.05);
  });

  it('low + converged → 0.0', () => {
    expect(getConvictionBonus('low', true)).toBe(0.0);
  });

  it('junk + converged → 0.0', () => {
    expect(getConvictionBonus('junk', true)).toBe(0.0);
  });

  it('unknown + converged → 0.0', () => {
    expect(getConvictionBonus('unknown', true)).toBe(0.0);
  });

  it('high + not converged → 0.0', () => {
    expect(getConvictionBonus('high', false)).toBe(0.0);
  });

  it('medium + not converged → 0.0', () => {
    expect(getConvictionBonus('medium', false)).toBe(0.0);
  });
});

// ============================================================
// Cache staleness — mocked DB calls
// ============================================================

vi.mock('@/lib/prisma', () => ({
  default: {
    qualitySnapshot: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        qualitySnapshot: { create: vi.fn().mockResolvedValue({}) },
      });
    }),
  },
}));

describe('isQualityCacheStale', () => {
  let isQualityCacheStale: (ticker: string) => Promise<boolean>;
  let mockFindFirst: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const prismaMod = await import('@/lib/prisma');
    const p = prismaMod.default as unknown as {
      qualitySnapshot: { findFirst: ReturnType<typeof vi.fn> };
    };
    mockFindFirst = p.qualitySnapshot.findFirst;
    const cacheMod = await import('./quality-cache');
    isQualityCacheStale = cacheMod.isQualityCacheStale;
  });

  it('returns true when no cached entry exists', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    expect(await isQualityCacheStale('AAPL')).toBe(true);
  });

  it('returns true when cached entry is expired', async () => {
    mockFindFirst.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });
    expect(await isQualityCacheStale('AAPL')).toBe(true);
  });

  it('returns false when cached entry is still valid', async () => {
    mockFindFirst.mockResolvedValueOnce({
      expiresAt: new Date(Date.now() + 86400000), // 1 day from now
    });
    expect(await isQualityCacheStale('AAPL')).toBe(false);
  });
});

// ============================================================
// getQualityScoreBatch — rate-limiting and cache integration
// ============================================================

vi.mock('yahoo-finance2', () => {
  const mockQuoteSummary = vi.fn();
  return {
    default: class {
      quoteSummary = mockQuoteSummary;
    },
    __mockQuoteSummary: mockQuoteSummary,
  };
});

vi.mock('@/lib/market-data', () => ({
  toYahooTicker: (ticker: string) => ticker,
}));

vi.mock('@/lib/fetch-retry', () => ({
  withRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

describe('getQualityScoreBatch', () => {
  let getQualityScoreBatch: (
    tickers: string[],
    forceRefresh?: boolean
  ) => Promise<QualityFilterResult[]>;
  let mockQuoteSummary: ReturnType<typeof vi.fn>;
  let mockFindFirst: ReturnType<typeof vi.fn>;

  // Import the result type
  type QualityFilterResult = {
    ticker: string;
    pass: boolean;
    qualityTier: string;
    qualityScore: number;
    momentumScoreMultiplier: number;
    roe: number | null;
    debtToEquity: number | null;
    revenueGrowth: number | null;
    isFinancialSector: boolean;
    dataComplete: boolean;
    fetchedAt: Date;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const prismaMod = await import('@/lib/prisma');
    const p = prismaMod.default as unknown as {
      qualitySnapshot: { findFirst: ReturnType<typeof vi.fn> };
    };
    mockFindFirst = p.qualitySnapshot.findFirst;

    const yfMod = await import('yahoo-finance2');
    mockQuoteSummary = (yfMod as unknown as { __mockQuoteSummary: ReturnType<typeof vi.fn> })
      .__mockQuoteSummary;

    const mod = await import('./quality-filter');
    getQualityScoreBatch = mod.getQualityScoreBatch;
  });

  it('uses cache for cached tickers and fetches uncached ones', async () => {
    // AAPL cached, MSFT not
    mockFindFirst
      .mockResolvedValueOnce({
        ticker: 'AAPL',
        pass: true,
        qualityTier: 'high',
        qualityScore: 3,
        momentumScoreMultiplier: 1.0,
        roe: 0.3,
        debtToEquity: 0.5,
        revenueGrowth: 0.1,
        isFinancialSector: false,
        dataComplete: true,
        fetchedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .mockResolvedValueOnce(null); // MSFT not cached

    mockQuoteSummary.mockResolvedValueOnce({
      financialData: {
        returnOnEquity: { raw: 0.35 },
        debtToEquity: { raw: 0.4 },
        revenueGrowth: { raw: 0.12 },
      },
      summaryProfile: { sector: 'Technology' },
    });

    const results = await getQualityScoreBatch(['AAPL', 'MSFT']);
    expect(results).toHaveLength(2);
    // Yahoo was only called once (MSFT)
    expect(mockQuoteSummary).toHaveBeenCalledTimes(1);
  });

  it('respects rate limiting delay between Yahoo calls', async () => {
    // All uncached
    mockFindFirst.mockResolvedValue(null);

    mockQuoteSummary.mockResolvedValue({
      financialData: {
        returnOnEquity: { raw: 0.20 },
        debtToEquity: { raw: 0.8 },
        revenueGrowth: { raw: 0.05 },
      },
      summaryProfile: { sector: 'Technology' },
    });

    const start = Date.now();
    await getQualityScoreBatch(['A', 'B', 'C'], true);
    const elapsed = Date.now() - start;

    // 3 tickers → 2 delays of 200ms each = 400ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(350); // allow slight timing tolerance
    expect(mockQuoteSummary).toHaveBeenCalledTimes(3);
  });
});
