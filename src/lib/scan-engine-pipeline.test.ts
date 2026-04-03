/**
 * scan-engine-pipeline.test.ts — Pipeline behavior tests
 *
 * Covers failed-breakout cooldown, technical filter combinations,
 * status classification thresholds, ranking logic, and multi-candidate scans.
 * Uses the same mocking infrastructure as scan-engine.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TechnicalData, Sleeve } from '@/types';

// ── Module mocks (vi.mock is hoisted before imports) ────────────

vi.mock('./prisma', () => ({
  default: {
    stock: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
  },
}));

vi.mock('./market-data', () => ({
  getTechnicalData: vi.fn(),
  getMarketRegime: vi.fn(),
  getVolRegime: vi.fn(),
  getQuickPrice: vi.fn(),
  getFXRate: vi.fn(),
  getDailyPrices: vi.fn(),
}));

vi.mock('./modules/adaptive-atr-buffer', () => ({
  calculateAdaptiveBuffer: vi.fn(),
}));

vi.mock('./position-sizer', () => ({
  calculatePositionSize: vi.fn(),
}));

vi.mock('./risk-gates', () => ({
  validateRiskGates: vi.fn(),
}));

vi.mock('./scan-guards', () => ({
  checkAntiChasingGuard: vi.fn(),
  checkPullbackContinuationEntry: vi.fn(),
}));

vi.mock('./modules/data-validator', () => ({
  validateTickerData: vi.fn(),
}));

vi.mock('./earnings-calendar', () => ({
  getEarningsInfo: vi.fn(),
  evaluateEarningsRisk: vi.fn(),
}));

vi.mock('./hurst', () => ({
  calcHurst: vi.fn(),
}));

// ── Imports (resolved after mock hoisting) ──────────────────────

import { runFullScan } from './scan-engine';
import prisma from './prisma';
import {
  getTechnicalData,
  getMarketRegime,
  getVolRegime,
  getQuickPrice,
  getFXRate,
  getDailyPrices,
} from './market-data';
import { calculateAdaptiveBuffer } from './modules/adaptive-atr-buffer';
import { calculatePositionSize } from './position-sizer';
import { validateRiskGates } from './risk-gates';
import { checkAntiChasingGuard, checkPullbackContinuationEntry } from './scan-guards';
import { validateTickerData } from './modules/data-validator';
import { getEarningsInfo, evaluateEarningsRisk } from './earnings-calendar';
import { calcHurst } from './hurst';

// ── Helpers ─────────────────────────────────────────────────────

function makeTechnicals(overrides?: Partial<TechnicalData>): TechnicalData {
  return {
    currentPrice: 100,
    ma200: 90,
    adx: 30,
    plusDI: 25,
    minusDI: 15,
    atr: 3,
    atr20DayAgo: 2.8,
    atrSpiking: false,
    medianAtr14: 2.9,
    atrPercent: 3.0,
    twentyDayHigh: 101,
    efficiency: 50,
    relativeStrength: 10,
    volumeRatio: 1.5,
    failedBreakoutAt: null,
    ...overrides,
  };
}

const MOCK_BARS = Array.from({ length: 200 }, (_, i) => ({
  date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
  open: 99,
  high: 102,
  low: 98,
  close: 100,
  volume: 1_000_000,
}));

function makeStock(overrides?: Partial<typeof DEFAULT_STOCK>) {
  return { ...DEFAULT_STOCK, ...overrides };
}

const DEFAULT_STOCK = {
  ticker: 'TEST',
  yahooTicker: 'TEST',
  name: 'Test Stock',
  sleeve: 'CORE',
  sector: 'Technology',
  cluster: 'General',
  currency: 'GBP',
  active: true,
};

/**
 * Wire all mocks for a single-ticker scan.
 * @param technicals TechnicalData to return from getTechnicalData
 * @param entryTrigger Overrides the adaptive buffer's adjustedEntryTrigger
 * @param stockOverrides Optional overrides for the stock record
 */
function setupMocks(
  technicals: TechnicalData,
  entryTrigger?: number,
  stockOverrides?: Partial<typeof DEFAULT_STOCK>,
) {
  const trigger = entryTrigger ?? technicals.twentyDayHigh;
  const stock = makeStock(stockOverrides);

  vi.mocked(prisma.stock.findMany).mockResolvedValue([stock] as never);
  vi.mocked(prisma.position.findMany).mockResolvedValue([] as never);

  vi.mocked(getMarketRegime).mockResolvedValue('BULLISH' as never);
  vi.mocked(getVolRegime).mockResolvedValue({ volRegime: 'NORMAL' } as never);

  vi.mocked(getTechnicalData).mockResolvedValue(technicals);
  vi.mocked(getDailyPrices).mockResolvedValue(MOCK_BARS as never);
  vi.mocked(getQuickPrice).mockResolvedValue(technicals.currentPrice);
  vi.mocked(getFXRate).mockResolvedValue(1);

  vi.mocked(validateTickerData).mockReturnValue({ isValid: true, issues: [] } as never);
  vi.mocked(calcHurst).mockReturnValue(0.6);

  vi.mocked(calculateAdaptiveBuffer).mockReturnValue({
    adjustedEntryTrigger: trigger,
    atrPercent: technicals.atrPercent,
    bufferPercent: 0.5,
    volRegimeMultiplier: 1,
  } as never);

  vi.mocked(getEarningsInfo).mockResolvedValue({
    daysUntilEarnings: null,
    nextEarningsDate: null,
    confidence: 'NONE',
  } as never);
  vi.mocked(evaluateEarningsRisk).mockReturnValue({
    action: null,
    info: { daysUntilEarnings: null, nextEarningsDate: null, confidence: 'NONE' },
    reason: null,
  } as never);

  vi.mocked(calculatePositionSize).mockReturnValue({
    shares: 10,
    totalCost: trigger * 10,
    riskDollars: 15,
    riskPercent: 0.15,
    entryPrice: trigger,
  } as never);

  vi.mocked(validateRiskGates).mockReturnValue([
    { passed: true, gate: 'totalRisk', message: 'OK', current: 1, limit: 10 },
  ] as never);

  vi.mocked(checkAntiChasingGuard).mockReturnValue({ passed: true, reason: 'OK' });
  vi.mocked(checkPullbackContinuationEntry).mockReturnValue({
    triggered: false,
    mode: 'BREAKOUT',
    anchor: 0,
    zoneLow: 0,
    zoneHigh: 0,
    reason: 'N/A',
  } as never);
}

/** Helpers for multi-stock scans. */
interface StockSetup {
  stock: typeof DEFAULT_STOCK & { [k: string]: unknown };
  technicals: TechnicalData;
  entryTrigger?: number;
  validData?: boolean; // default true
}

function setupMultiMocks(items: StockSetup[]) {
  const stocks = items.map((s) => s.stock);

  vi.mocked(prisma.stock.findMany).mockResolvedValue(stocks as never);
  vi.mocked(prisma.position.findMany).mockResolvedValue([] as never);

  vi.mocked(getMarketRegime).mockResolvedValue('BULLISH' as never);
  vi.mocked(getVolRegime).mockResolvedValue({ volRegime: 'NORMAL' } as never);

  vi.mocked(getTechnicalData).mockImplementation(async (ticker: string) => {
    const match = items.find((s) => s.stock.ticker === ticker);
    return match ? match.technicals : null;
  });
  vi.mocked(getDailyPrices).mockResolvedValue(MOCK_BARS as never);
  vi.mocked(getQuickPrice).mockImplementation(async (ticker: string) => {
    const match = items.find((s) => s.stock.ticker === ticker);
    return match ? match.technicals.currentPrice : 0;
  });
  vi.mocked(getFXRate).mockResolvedValue(1);

  vi.mocked(validateTickerData).mockImplementation((ticker: string) => {
    const match = items.find((s) => s.stock.ticker === ticker);
    const valid = match?.validData !== false;
    return { isValid: valid, issues: valid ? [] : ['Bad data'] } as never;
  });
  vi.mocked(calcHurst).mockReturnValue(0.6);

  vi.mocked(calculateAdaptiveBuffer).mockImplementation(
    (ticker: string, twentyDayHigh: number, _atr: number, atrPercent: number) => {
      const match = items.find((s) => s.stock.ticker === ticker);
      const trigger = match?.entryTrigger ?? twentyDayHigh;
      return {
        adjustedEntryTrigger: trigger,
        atrPercent,
        bufferPercent: 0.5,
        volRegimeMultiplier: 1,
      } as never;
    },
  );

  vi.mocked(getEarningsInfo).mockResolvedValue({
    daysUntilEarnings: null,
    nextEarningsDate: null,
    confidence: 'NONE',
  } as never);
  vi.mocked(evaluateEarningsRisk).mockReturnValue({
    action: null,
    info: { daysUntilEarnings: null, nextEarningsDate: null, confidence: 'NONE' },
    reason: null,
  } as never);

  vi.mocked(calculatePositionSize).mockImplementation(({ entryPrice }: { entryPrice: number }) => ({
    shares: 10,
    totalCost: entryPrice * 10,
    riskDollars: 15,
    riskPercent: 0.15,
    entryPrice,
  }) as never);

  vi.mocked(validateRiskGates).mockReturnValue([
    { passed: true, gate: 'totalRisk', message: 'OK', current: 1, limit: 10 },
  ] as never);

  vi.mocked(checkAntiChasingGuard).mockReturnValue({ passed: true, reason: 'OK' });
  vi.mocked(checkPullbackContinuationEntry).mockReturnValue({
    triggered: false,
    mode: 'BREAKOUT',
    anchor: 0,
    zoneLow: 0,
    zoneHigh: 0,
    reason: 'N/A',
  } as never);
}

/** Run a scan with one ticker and return the sole candidate. */
async function scanOne(
  technicals: TechnicalData,
  entryTrigger?: number,
  stockOverrides?: Partial<typeof DEFAULT_STOCK>,
) {
  setupMocks(technicals, entryTrigger, stockOverrides);
  const result = await runFullScan('test-user', 'BALANCED', 10_000);
  expect(result.candidates).toHaveLength(1);
  return result.candidates[0];
}

// ── Tests ───────────────────────────────────────────────────────

describe('scan-engine pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // 1. Failed breakout cooldown (FAILED_BREAKOUT_COOLDOWN_DAYS = 3)
  // ────────────────────────────────────────────────────────────

  describe('failed breakout cooldown', () => {
    it('forces COOLDOWN when failedBreakoutAt < 3 days ago and volume is low', async () => {
      // 1 day ago + volumeRatio < 1.0 → cooldown triggers
      const c = await scanOne(
        makeTechnicals({
          failedBreakoutAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          volumeRatio: 0.8,
        }),
        101,
      );
      expect(c.status).toBe('COOLDOWN');
      expect(c.passesAntiChase).toBe(false);
    });

    it('allows normal status when failedBreakoutAt > 3 days ago', async () => {
      // 4 days ago → cooldown expired, normal classification applies
      const c = await scanOne(
        makeTechnicals({
          failedBreakoutAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
          volumeRatio: 0.8,
        }),
        101,
      );
      expect(c.status).not.toBe('COOLDOWN');
      expect(c.status).toBe('READY');
    });

    it('has no cooldown effect when failedBreakoutAt is null', async () => {
      const c = await scanOne(
        makeTechnicals({ failedBreakoutAt: null, volumeRatio: 0.8 }),
        101,
      );
      expect(c.status).not.toBe('COOLDOWN');
      expect(c.status).toBe('READY');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Technical filter combinations (full pipeline)
  // ────────────────────────────────────────────────────────────

  describe('technical filter combinations', () => {
    it('fails when price is below MA200', async () => {
      const c = await scanOne(
        makeTechnicals({ currentPrice: 85, ma200: 90 }),
        101,
      );
      expect(c.filterResults.priceAboveMa200).toBe(false);
      expect(c.passesAllFilters).toBe(false);
    });

    it('fails when ADX is below 20', async () => {
      const c = await scanOne(makeTechnicals({ adx: 15 }), 101);
      expect(c.filterResults.adxAbove20).toBe(false);
      expect(c.passesAllFilters).toBe(false);
    });

    it('fails when ATR% is above 8% (volatile ticker)', async () => {
      const c = await scanOne(makeTechnicals({ atrPercent: 9 }), 101);
      expect(c.filterResults.atrPercentBelow8).toBe(false);
      expect(c.passesAllFilters).toBe(false);
    });

    it('passes all filters for a standard CORE candidate', async () => {
      const c = await scanOne(makeTechnicals(), 101);
      expect(c.filterResults.priceAboveMa200).toBe(true);
      expect(c.filterResults.adxAbove20).toBe(true);
      expect(c.filterResults.plusDIAboveMinusDI).toBe(true);
      expect(c.filterResults.atrPercentBelow8).toBe(true);
      expect(c.filterResults.efficiencyAbove30).toBe(true);
      expect(c.passesAllFilters).toBe(true);
    });

    it('flags efficiency below 30% (informational, does not block passesAll)', async () => {
      const c = await scanOne(makeTechnicals({ efficiency: 20 }), 101);
      expect(c.filterResults.efficiencyAbove30).toBe(false);
      // efficiency is informational — passesAll is unaffected
      expect(c.passesAllFilters).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Status classification thresholds (full pipeline)
  // ────────────────────────────────────────────────────────────

  describe('status classification thresholds', () => {
    it('READY when distance to entry trigger ≤ 2%', async () => {
      // trigger=101, price=100 → 1% distance
      const c = await scanOne(makeTechnicals(), 101);
      expect(c.status).toBe('READY');
    });

    it('WATCH when distance is between 2% and 3%', async () => {
      // trigger=102.5, price=100 → 2.5% distance
      const c = await scanOne(makeTechnicals({ twentyDayHigh: 102.5 }), 102.5);
      expect(c.status).toBe('WATCH');
    });

    it('FAR when distance is > 3%', async () => {
      // trigger=105, price=100 → 5% distance
      const c = await scanOne(makeTechnicals({ twentyDayHigh: 105 }), 105);
      expect(c.status).toBe('FAR');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Ranking logic (full pipeline)
  // ────────────────────────────────────────────────────────────

  describe('ranking logic', () => {
    it('CORE sleeve gets higher rank than HIGH_RISK', async () => {
      const coreCandidate = await scanOne(
        makeTechnicals(),
        101,
        { sleeve: 'CORE' },
      );
      const hrCandidate = await scanOne(
        makeTechnicals(),
        101,
        { sleeve: 'HIGH_RISK' },
      );
      expect(coreCandidate.rankScore).toBeGreaterThan(hrCandidate.rankScore);
    });

    it('READY status gets ranking bonus over WATCH', async () => {
      // READY: trigger=101, price=100 → 1% → READY
      const readyCandidate = await scanOne(makeTechnicals(), 101);
      // WATCH: trigger=102.5, price=100 → 2.5% → WATCH
      const watchCandidate = await scanOne(
        makeTechnicals({ twentyDayHigh: 102.5 }),
        102.5,
      );
      expect(readyCandidate.rankScore).toBeGreaterThan(watchCandidate.rankScore);
    });

    it('higher ADX improves rank score', async () => {
      const highAdx = await scanOne(makeTechnicals({ adx: 45 }), 101);
      const lowAdx = await scanOne(makeTechnicals({ adx: 22 }), 101);
      expect(highAdx.rankScore).toBeGreaterThan(lowAdx.rankScore);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Multi-candidate scan
  // ────────────────────────────────────────────────────────────

  describe('multi-candidate scan', () => {
    it('returns both READY and WATCH candidates, READY ranked higher', async () => {
      setupMultiMocks([
        {
          stock: makeStock({ ticker: 'ALPHA', yahooTicker: 'ALPHA', name: 'Alpha Inc' }),
          technicals: makeTechnicals({ twentyDayHigh: 101 }),
          entryTrigger: 101, // 1% → READY
        },
        {
          stock: makeStock({ ticker: 'BETA', yahooTicker: 'BETA', name: 'Beta Corp' }),
          technicals: makeTechnicals({ twentyDayHigh: 102.5 }),
          entryTrigger: 102.5, // 2.5% → WATCH
        },
      ]);

      const result = await runFullScan('test-user', 'BALANCED', 10_000);
      expect(result.candidates).toHaveLength(2);

      const alpha = result.candidates.find((c) => c.ticker === 'ALPHA')!;
      const beta = result.candidates.find((c) => c.ticker === 'BETA')!;
      expect(alpha.status).toBe('READY');
      expect(beta.status).toBe('WATCH');

      // READY should be sorted before WATCH
      expect(result.candidates[0].ticker).toBe('ALPHA');
      expect(result.candidates[1].ticker).toBe('BETA');
    });

    it('excludes candidate with invalid data from results', async () => {
      setupMultiMocks([
        {
          stock: makeStock({ ticker: 'GOOD', yahooTicker: 'GOOD', name: 'Good Stock' }),
          technicals: makeTechnicals({ twentyDayHigh: 101 }),
          entryTrigger: 101,
          validData: true,
        },
        {
          stock: makeStock({ ticker: 'BAD', yahooTicker: 'BAD', name: 'Bad Stock' }),
          technicals: makeTechnicals({ twentyDayHigh: 101 }),
          entryTrigger: 101,
          validData: false, // data validation fails → excluded
        },
      ]);

      const result = await runFullScan('test-user', 'BALANCED', 10_000);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].ticker).toBe('GOOD');
    });
  });
});
