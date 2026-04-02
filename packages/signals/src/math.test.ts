import { describe, expect, it } from 'vitest';
import { average, ema, slope, highest, computeAtr, round } from './math';
import type { SignalBar } from './types';

function makeBar(close: number, high?: number, low?: number, volume = 1000): SignalBar {
  return {
    date: new Date(),
    open: close,
    high: high ?? close * 1.01,
    low: low ?? close * 0.99,
    close,
    volume,
  };
}

describe('average', () => {
  it('returns 0 for empty array', () => {
    expect(average([])).toBe(0);
  });

  it('calculates mean of values', () => {
    expect(average([10, 20, 30])).toBe(20);
  });

  it('handles single value', () => {
    expect(average([42])).toBe(42);
  });
});

describe('ema', () => {
  it('returns 0 for empty array', () => {
    expect(ema([], 10)).toBe(0);
  });

  it('returns the value for single element', () => {
    expect(ema([100], 10)).toBe(100);
  });

  it('applies exponential weighting', () => {
    const values = [10, 20, 30, 40, 50];
    const result = ema(values, 3);
    // Multiplier = 2/(3+1) = 0.5
    // Step: 10 → 15 → 22.5 → 31.25 → 40.625
    expect(result).toBeCloseTo(40.625, 2);
  });
});

describe('slope', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(slope([])).toBe(0);
    expect(slope([100])).toBe(0);
  });

  it('positive slope for uptrend', () => {
    expect(slope([100, 110])).toBeCloseTo(10, 0);
  });

  it('negative slope for downtrend', () => {
    expect(slope([100, 90])).toBeCloseTo(-10, 0);
  });

  it('handles near-zero first value', () => {
    // Uses Math.max(abs(first), 0.0001) to avoid division by zero
    expect(slope([0, 10])).toBeGreaterThan(0);
  });
});

describe('highest', () => {
  it('returns 0 for empty array', () => {
    expect(highest([])).toBe(0);
  });

  it('finds maximum value', () => {
    expect(highest([10, 50, 30, 20])).toBe(50);
  });

  it('handles negative values', () => {
    expect(highest([-10, -5, -20])).toBe(-5);
  });
});

describe('computeAtr', () => {
  it('returns 0 when bars are insufficient', () => {
    const bars = [makeBar(100), makeBar(101)];
    expect(computeAtr(bars, 14)).toBe(0);
  });

  it('computes ATR correctly for a simple series', () => {
    // Need period+1 bars. Build 5 bars for period=4
    const bars: SignalBar[] = [
      makeBar(100, 102, 98),
      makeBar(101, 103, 99),
      makeBar(102, 105, 100),
      makeBar(103, 106, 101),
      makeBar(104, 107, 102),
    ];
    const result = computeAtr(bars, 4);
    expect(result).toBeGreaterThan(0);
  });
});

describe('round', () => {
  it('rounds to 4 decimal places by default', () => {
    expect(round(1.23456789)).toBe(1.2346);
  });

  it('rounds to specified precision', () => {
    expect(round(1.23456, 2)).toBe(1.23);
  });

  it('handles integers', () => {
    expect(round(42)).toBe(42);
  });
});
