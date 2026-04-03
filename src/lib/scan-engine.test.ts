/**
 * scan-engine.test.ts — ATR spike detection behavior
 *
 * First dedicated test file for the scan-engine sacred file.
 * Focuses on ATR spike detection logic (medianSpiking → SOFT_CAP / status demotion).
 *
 * The ATR spike check lives inside runFullScan(), so we mock all external
 * dependencies and feed controlled TechnicalData to verify outputs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TechnicalData } from '@/types';

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

const MOCK_STOCK = {
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
 * @param technicals - TechnicalData to return from getTechnicalData
 * @param entryTrigger - Overrides the adaptive buffer's adjustedEntryTrigger
 *                       (controls initial READY/WATCH/FAR classification)
 */
function setupMocks(technicals: TechnicalData, entryTrigger?: number) {
  const trigger = entryTrigger ?? technicals.twentyDayHigh;

  // Stage 1: Universe
  vi.mocked(prisma.stock.findMany).mockResolvedValue([MOCK_STOCK] as never);
  vi.mocked(prisma.position.findMany).mockResolvedValue([] as never);

  // Regime detection
  vi.mocked(getMarketRegime).mockResolvedValue('BULLISH' as never);
  vi.mocked(getVolRegime).mockResolvedValue({ volRegime: 'NORMAL' } as never);

  // Per-ticker data
  vi.mocked(getTechnicalData).mockResolvedValue(technicals);
  vi.mocked(getDailyPrices).mockResolvedValue(MOCK_BARS as never);
  vi.mocked(getQuickPrice).mockResolvedValue(technicals.currentPrice);
  vi.mocked(getFXRate).mockResolvedValue(1);

  // Data validation — always valid
  vi.mocked(validateTickerData).mockReturnValue({ isValid: true, issues: [] } as never);

  // Hurst — above 0.5 so no warn
  vi.mocked(calcHurst).mockReturnValue(0.6);

  // Adaptive buffer — controls entry trigger
  vi.mocked(calculateAdaptiveBuffer).mockReturnValue({
    adjustedEntryTrigger: trigger,
    atrPercent: technicals.atrPercent,
    bufferPercent: 0.5,
    volRegimeMultiplier: 1,
  } as never);

  // Earnings — benign (no block, no demotion)
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

  // Position sizing
  vi.mocked(calculatePositionSize).mockReturnValue({
    shares: 10,
    totalCost: trigger * 10,
    riskDollars: 15,
    riskPercent: 0.15,
    entryPrice: trigger,
  } as never);

  // Risk gates — all pass
  vi.mocked(validateRiskGates).mockReturnValue([
    { passed: true, gate: 'totalRisk', message: 'OK', current: 1, limit: 10 },
  ] as never);

  // Anti-chase — pass
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
async function scanOne(technicals: TechnicalData, entryTrigger?: number) {
  setupMocks(technicals, entryTrigger);
  const result = await runFullScan('test-user', 'BALANCED', 10_000);
  expect(result.candidates).toHaveLength(1);
  return result.candidates[0];
}

// ── Tests ───────────────────────────────────────────────────────

describe('scan-engine: ATR spike detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────
  // 1. Median ATR spike calculation
  // ────────────────────────────────────────────────────────────

  describe('median ATR spike calculation', () => {
    it('detects spike when atr >= medianAtr14 × 1.3', async () => {
      // 2.8 >= 2.0 * 1.3 (2.6) → spiking
      const c = await scanOne(makeTechnicals({ medianAtr14: 2.0, atr: 2.8 }));
      expect(c.filterResults.atrSpiking).toBe(true);
    });

    it('does NOT detect spike when atr < medianAtr14 × 1.3', async () => {
      // 2.5 < 2.0 * 1.3 (2.6) → not spiking
      const c = await scanOne(makeTechnicals({ medianAtr14: 2.0, atr: 2.5 }));
      expect(c.filterResults.atrSpiking).toBe(false);
      expect(c.filterResults.atrSpikeAction).toBe('NONE');
    });

    it('treats exact boundary as spiking (atr === medianAtr14 × 1.3)', async () => {
      // 2.6 >= 2.0 * 1.3 (2.6) → spiking (≥ not >)
      const c = await scanOne(makeTechnicals({ medianAtr14: 2.0, atr: 2.6 }));
      expect(c.filterResults.atrSpiking).toBe(true);
    });

    it('falls back to technicals.atrSpiking=true when medianAtr14 = 0', async () => {
      const c = await scanOne(makeTechnicals({ medianAtr14: 0, atrSpiking: true, atr: 3.0 }));
      expect(c.filterResults.atrSpiking).toBe(true);
    });

    it('falls back to technicals.atrSpiking=false when medianAtr14 = 0', async () => {
      const c = await scanOne(makeTechnicals({ medianAtr14: 0, atrSpiking: false, atr: 3.0 }));
      expect(c.filterResults.atrSpiking).toBe(false);
      expect(c.filterResults.atrSpikeAction).toBe('NONE');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Spike action and status demotion
  // ────────────────────────────────────────────────────────────

  describe('spike action and status demotion', () => {
    it('spiking + READY → SOFT_CAP, status demoted to WATCH', async () => {
      // entryTrigger=101, price=100 → distance 1% → READY
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, twentyDayHigh: 101 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
      expect(c.status).toBe('WATCH');
    });

    it('spiking + already WATCH → SOFT_CAP, status stays WATCH', async () => {
      // entryTrigger=102.5, price=100 → distance 2.5% → WATCH
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, twentyDayHigh: 102.5 }),
        102.5,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
      expect(c.status).toBe('WATCH');
    });

    it('spiking + FAR → SOFT_CAP, status stays FAR (no promotion)', async () => {
      // entryTrigger=105, price=100 → distance 5% → FAR
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, twentyDayHigh: 105 }),
        105,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
      expect(c.status).toBe('FAR');
    });

    it('NOT spiking + READY → NONE, status stays READY', async () => {
      // 3.0 < 2.9 * 1.3 (3.77) → not spiking
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.9, atr: 3.0, twentyDayHigh: 101 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('NONE');
      expect(c.status).toBe('READY');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. DI direction must NOT affect spike action
  //    (This is the fix: old code checked adx < 18 and ignored
  //     spikes when adx >= 18. New behavior applies SOFT_CAP
  //     unconditionally when spiking.)
  // ────────────────────────────────────────────────────────────

  describe('DI direction does NOT affect spike action', () => {
    it('spiking + bullish DI (+DI > −DI) → SOFT_CAP', async () => {
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, plusDI: 30, minusDI: 15, adx: 25 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
    });

    it('spiking + bearish DI (−DI > +DI) → SOFT_CAP (same result)', async () => {
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, plusDI: 15, minusDI: 30, adx: 25 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
    });

    it('spiking + high ADX (40, strong trend) → still SOFT_CAP', async () => {
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, adx: 40, plusDI: 25, minusDI: 15 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
    });

    it('spiking + ADX at old boundary (18) → SOFT_CAP', async () => {
      // Old code: adx < 18 was false at 18, so no SOFT_CAP — this is the bug.
      // After fix: SOFT_CAP regardless of ADX.
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, adx: 18, plusDI: 25, minusDI: 15 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
    });

    it('spiking + low ADX (15, below old threshold) → SOFT_CAP', async () => {
      // This should pass on both old and new code
      const c = await scanOne(
        makeTechnicals({ medianAtr14: 2.0, atr: 3.0, adx: 15, plusDI: 25, minusDI: 15 }),
        101,
      );
      expect(c.filterResults.atrSpikeAction).toBe('SOFT_CAP');
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. HARD_BLOCK regression guard
  //    The entire point of the fix is that HARD_BLOCK should never
  //    appear. If any code path produces it, this suite catches it.
  // ────────────────────────────────────────────────────────────

  describe('HARD_BLOCK must never be produced (regression)', () => {
    const cases = [
      { label: 'spiking, low ADX (10)', medianAtr14: 2.0, atr: 3.0, adx: 10, plusDI: 25, minusDI: 15 },
      { label: 'spiking, high ADX (40)', medianAtr14: 2.0, atr: 3.0, adx: 40, plusDI: 25, minusDI: 15 },
      { label: 'spiking, bearish DI', medianAtr14: 2.0, atr: 3.0, adx: 30, plusDI: 10, minusDI: 30 },
      { label: 'not spiking', medianAtr14: 5.0, atr: 3.0, adx: 30, plusDI: 25, minusDI: 15 },
      { label: 'extreme spike (3× median)', medianAtr14: 1.0, atr: 3.0, adx: 30, plusDI: 25, minusDI: 15 },
      { label: 'spiking at ADX boundary (18)', medianAtr14: 2.0, atr: 3.0, adx: 18, plusDI: 25, minusDI: 15 },
    ];

    for (const tc of cases) {
      it(`never HARD_BLOCK: ${tc.label}`, async () => {
        const c = await scanOne(
          makeTechnicals({
            medianAtr14: tc.medianAtr14,
            atr: tc.atr,
            adx: tc.adx,
            plusDI: tc.plusDI,
            minusDI: tc.minusDI,
          }),
          101,
        );
        expect(c.filterResults.atrSpikeAction).not.toBe('HARD_BLOCK');
      });
    }
  });
});
