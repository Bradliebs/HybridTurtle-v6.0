/**
 * market-data.test.ts — FX rate tests for getFXRate
 *
 * Regression guard: getFXRate must NEVER silently return 1.0 for unknown
 * currency pairs. That causes catastrophic mis-sizing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Module mocks (hoisted before imports) ───────────────────

vi.mock('yahoo-finance2', () => {
  const mockQuote = vi.fn();
  return {
    default: class YahooFinance {
      suppressNotices: string[];
      constructor(_opts: unknown) {
        this.suppressNotices = [];
      }
      quote = mockQuote;
    },
    __mockQuote: mockQuote,
  };
});

vi.mock('./regime-detector', () => ({
  detectVolRegime: vi.fn(),
}));

vi.mock('./market-data-eodhd', () => ({
  getFXRate: vi.fn(),
  getStockQuote: vi.fn(),
  getDailyPrices: vi.fn(),
  getMarketIndices: vi.fn(),
  getFearGreedIndex: vi.fn(),
}));

vi.mock('./breakout-integrity', () => ({
  calcBIS: vi.fn(),
}));

vi.mock('./cache-persistence', () => ({
  persistCache: vi.fn(),
  rehydrateCache: vi.fn(),
}));

vi.mock('./cache-keys', () => ({
  CACHE_KEYS: { FX: 'fx' },
}));

vi.mock('./fetch-retry', () => ({
  YAHOO_RETRY_ENABLED: true,
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Now import the module under test
import { getFXRate } from './market-data';

// Get the mock quote function from our yahoo-finance2 mock
let mockQuote: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Access the mock through the module mock
  const yfModule = await vi.importMock<{ __mockQuote: ReturnType<typeof vi.fn> }>('yahoo-finance2');
  mockQuote = yfModule.__mockQuote;
  // Default: Yahoo fails so we hit fallback logic
  mockQuote.mockRejectedValue(new Error('Network error'));
});

describe('getFXRate', () => {
  // ── Same-currency identity ──
  it('returns exactly 1 for same currency (GBP→GBP)', async () => {
    const rate = await getFXRate('GBP', 'GBP');
    expect(rate).toBe(1);
    // Should NOT call Yahoo for identity conversion
    expect(mockQuote).not.toHaveBeenCalled();
  });

  it('returns exactly 1 for same currency (USD→USD)', async () => {
    const rate = await getFXRate('USD', 'USD');
    expect(rate).toBe(1);
  });

  // ── Known fallback pairs (Yahoo mocked to fail) ──
  it('returns fallback rate for USDGBP when Yahoo fails', async () => {
    const rate = await getFXRate('USD', 'GBP');
    expect(rate).toBe(0.79);
  });

  it('returns fallback rate for EURGBP when Yahoo fails', async () => {
    const rate = await getFXRate('EUR', 'GBP');
    expect(rate).toBe(0.86);
  });

  it('returns fallback rate for CHFGBP when Yahoo fails', async () => {
    const rate = await getFXRate('CHF', 'GBP');
    expect(rate).toBe(0.89);
  });

  it('returns fallback rate for inverse pair GBPUSD when Yahoo fails', async () => {
    const rate = await getFXRate('GBP', 'USD');
    expect(rate).toBe(1.27);
  });

  // ── Unknown pair throws (NEVER returns 1.0) ──
  it('throws for unknown pair XYZ→GBP', async () => {
    await expect(getFXRate('XYZ', 'GBP')).rejects.toThrow('No FX rate available');
  });

  it('throws for unknown pair BRL→GBP', async () => {
    await expect(getFXRate('BRL', 'GBP')).rejects.toThrow('No FX rate available');
  });

  it('never returns exactly 1.0 for any foreign→GBP fallback', async () => {
    // Every known fallback that converts TO GBP should NOT be 1.0
    const foreignCurrencies = ['USD', 'EUR', 'CHF', 'DKK', 'SEK', 'AUD', 'CNY'];
    for (const curr of foreignCurrencies) {
      const rate = await getFXRate(curr, 'GBP', true); // forceRefresh to skip cache
      expect(rate).not.toBe(1.0);
      expect(rate).toBeGreaterThan(0);
    }
  });

  // ── Yahoo success path ──
  it('returns live rate from Yahoo when available', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 0.81 });
    const rate = await getFXRate('USD', 'GBP', true); // forceRefresh
    expect(rate).toBe(0.81);
  });

  // ── REGRESSION GUARD: source code must not contain silent "?? 1" in getFXRate ──
  it('getFXRate source does NOT contain a silent ?? 1 fallback', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'market-data.ts'),
      'utf-8'
    );
    // Extract just the getFXRate function body (from export to next export/end)
    const fnMatch = source.match(
      /export async function getFXRate\b[\s\S]*?(?=\nexport |\n\/\/ ── UK Ticker)/
    );
    expect(fnMatch).toBeTruthy();
    const fnBody = fnMatch![0];
    // Must NOT contain "?? 1" or "?? 1.0" — that would be a silent fallback
    expect(fnBody).not.toMatch(/\?\?\s*1(?:\.0)?\b/);
  });
});
