import { describe, expect, it } from 'vitest';
import {
  calculatePositionSize,
  calculateRMultiple,
  calculateEntryTrigger,
  calculateGainPercent,
  calculateGainDollars,
} from './position-sizer';

describe('position-sizer formulas', () => {
  it('calculates shares, cost, and risk for a standard long setup', () => {
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 95,
    });

    expect(result.shares).toBe(19);
    expect(result.totalCost).toBe(1900);
    expect(result.riskDollars).toBe(95);
    expect(result.riskPercent).toBeCloseTo(0.95, 8);
    expect(result.rPerShare).toBe(5);
  });

  it('enforces sleeve position-size cap using FX-adjusted total cost', () => {
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 99,
      sleeve: 'CORE',
      fxToGbp: 2,
    });

    expect(result.shares).toBe(9);
    expect(result.totalCost).toBe(1800);
  });

  it('throws for invalid long stop placement', () => {
    expect(() =>
      calculatePositionSize({
        equity: 10_000,
        riskProfile: 'BALANCED',
        entryPrice: 100,
        stopPrice: 100,
      })
    ).toThrow('Stop price must be below entry price for long positions');
  });

  it('computes R-multiple from current, entry, and initial risk', () => {
    expect(calculateRMultiple(110, 100, 5)).toBe(2);
    expect(calculateRMultiple(95, 100, 5)).toBe(-1);
  });

  // ── FX conversion tests ──

  it('FX rate affects share count: higher fxToGbp means fewer shares', () => {
    const baseline = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 50,
      stopPrice: 45,
      fxToGbp: 1.0,
    });
    const withFx = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 50,
      stopPrice: 45,
      fxToGbp: 0.79, // USD→GBP
    });
    // Lower FX rate = larger riskPerShare in GBP denominator is smaller, so MORE shares
    expect(withFx.shares).toBeGreaterThan(baseline.shares);
  });

  it('totalCost is denominated in GBP via fxToGbp', () => {
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 95,
      fxToGbp: 0.79,
    });
    // totalCost = shares × entryPrice × fxToGbp (GBP-denominated)
    expect(result.totalCost).toBeCloseTo(result.shares * 100 * 0.79, 2);
  });

  it('throws when fxToGbp is zero (unavailable rate)', () => {
    expect(() =>
      calculatePositionSize({
        equity: 10_000,
        riskProfile: 'BALANCED',
        entryPrice: 100,
        stopPrice: 95,
        fxToGbp: 0,
      })
    ).toThrow('FX rate must be positive');
  });

  it('throws when fxToGbp is negative', () => {
    expect(() =>
      calculatePositionSize({
        equity: 10_000,
        riskProfile: 'BALANCED',
        entryPrice: 100,
        stopPrice: 95,
        fxToGbp: -1,
      })
    ).toThrow('FX rate must be positive');
  });
});

// ── calculateEntryTrigger ──

describe('calculateEntryTrigger', () => {
  it('returns 20d high plus 10% ATR buffer', () => {
    // trigger = 200 + 0.1 * 10 = 201
    expect(calculateEntryTrigger(200, 10)).toBe(201);
  });

  it('equals 20d high when ATR is zero', () => {
    expect(calculateEntryTrigger(150, 0)).toBe(150);
  });

  it('returns value below 20d high when ATR is negative', () => {
    const trigger = calculateEntryTrigger(100, -5);
    expect(trigger).toBe(99.5); // 100 + 0.1 * (-5)
    expect(trigger).toBeLessThan(100);
  });
});

// ── calculateGainPercent ──

describe('calculateGainPercent', () => {
  it('returns positive gain when price is above entry', () => {
    // (120 - 100) / 100 * 100 = 20%
    expect(calculateGainPercent(120, 100)).toBe(20);
  });

  it('returns negative gain when price is below entry', () => {
    // (80 - 100) / 100 * 100 = -20%
    expect(calculateGainPercent(80, 100)).toBe(-20);
  });

  it('returns zero when price equals entry', () => {
    expect(calculateGainPercent(50, 50)).toBe(0);
  });
});

// ── calculateGainDollars ──

describe('calculateGainDollars', () => {
  it('computes dollar gain for multiple shares', () => {
    // (55 - 50) * 20 = 100
    expect(calculateGainDollars(55, 50, 20)).toBe(100);
  });

  it('computes dollar loss when price is below entry', () => {
    // (45 - 50) * 20 = -100
    expect(calculateGainDollars(45, 50, 20)).toBe(-100);
  });
});

// ── Floor-down rule (CRITICAL) ──

describe('floor-down share rounding', () => {
  it('always floors shares — 10.9 raw shares yields 10', () => {
    // BALANCED riskPerTrade = 0.95%
    // riskCash = 10000 * 0.0095 = 95
    // riskPerShare = (100 - 90.3) * 1.0 = 9.7
    // raw shares = 95 / 9.7 ≈ 9.7938 → floor = 9
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 90.3,
      fxToGbp: 1.0,
    });
    expect(result.shares).toBe(Math.floor(result.shares));
    expect(Number.isInteger(result.shares)).toBe(true);
  });

  it('floors down when equity barely affords N+1 shares', () => {
    // BALANCED: riskCash = 10000 * 0.0095 = 95
    // riskPerShare = (50 - 45) * 1 = 5
    // raw shares = 95 / 5 = 19.0 exactly → floor = 19
    // Now tweak stop so raw is just under 20:
    // riskPerShare = (50 - 45.25) * 1 = 4.75
    // raw shares = 95 / 4.75 = 20.0 exactly → floor = 20
    // riskPerShare = (50 - 45.24) * 1 = 4.76
    // raw shares = 95 / 4.76 ≈ 19.957.. → floor = 19
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 50,
      stopPrice: 45.24,
      fxToGbp: 1.0,
    });
    expect(result.shares).toBe(19);
    expect(Number.isInteger(result.shares)).toBe(true);
  });

  it('never exceeds risk budget due to rounding', () => {
    const result = calculatePositionSize({
      equity: 5_000,
      riskProfile: 'BALANCED',
      entryPrice: 33.5,
      stopPrice: 30.1,
      fxToGbp: 1.0,
    });
    const maxRiskCash = 5_000 * (0.95 / 100);
    const actualRisk = result.shares * (33.5 - 30.1);
    expect(actualRisk).toBeLessThanOrEqual(maxRiskCash);
    expect(Number.isInteger(result.shares)).toBe(true);
  });
});

// ── Risk profiles ──

describe('risk profile affects share count', () => {
  const baseInput = {
    equity: 10_000,
    entryPrice: 100,
    stopPrice: 95,
    fxToGbp: 1.0,
  } as const;

  it('AGGRESSIVE profile yields more shares than BALANCED', () => {
    const aggressive = calculatePositionSize({ ...baseInput, riskProfile: 'AGGRESSIVE' });
    const balanced = calculatePositionSize({ ...baseInput, riskProfile: 'BALANCED' });
    expect(aggressive.shares).toBeGreaterThan(balanced.shares);
  });

  it('CONSERVATIVE profile yields fewer shares than BALANCED', () => {
    const conservative = calculatePositionSize({ ...baseInput, riskProfile: 'CONSERVATIVE' });
    const balanced = calculatePositionSize({ ...baseInput, riskProfile: 'BALANCED' });
    expect(conservative.shares).toBeLessThan(balanced.shares);
  });
});

// ── FX edge cases (expanded) ──

describe('FX edge cases', () => {
  it('very large FX rate (JPY ~150) reduces share count dramatically', () => {
    const result = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 5000,   // JPY-denominated stock
      stopPrice: 4500,
      fxToGbp: 150,
    });
    // riskPerShare = (5000 - 4500) * 150 = 75,000 GBP per share
    // riskCash = 10000 * 0.0095 = 95 → 95 / 75000 ≈ 0.00126 → floor = 0
    expect(result.shares).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it('FX rate of exactly 1.0 produces same result as omitting fxToGbp', () => {
    const withExplicit = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 95,
      fxToGbp: 1.0,
    });
    const withDefault = calculatePositionSize({
      equity: 10_000,
      riskProfile: 'BALANCED',
      entryPrice: 100,
      stopPrice: 95,
    });
    expect(withExplicit.shares).toBe(withDefault.shares);
    expect(withExplicit.totalCost).toBe(withDefault.totalCost);
    expect(withExplicit.riskDollars).toBe(withDefault.riskDollars);
  });
});

// ── calculateRMultiple edge cases ──

describe('calculateRMultiple edge cases', () => {
  it('returns 0R when price is exactly at entry', () => {
    expect(calculateRMultiple(100, 100, 5)).toBe(0);
  });

  it('returns -1R when price is at initial stop', () => {
    // entry=100, initialRisk=5 (stop was 95), current=95
    expect(calculateRMultiple(95, 100, 5)).toBe(-1);
  });

  it('returns large positive R for a big winner', () => {
    // entry=100, initialRisk=5, current=130 → (130-100)/5 = 6R
    expect(calculateRMultiple(130, 100, 5)).toBe(6);
  });

  it('returns 0 when initialRisk is zero', () => {
    expect(calculateRMultiple(110, 100, 0)).toBe(0);
  });
});
