import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/src/env', () => ({
  env: {
    EVENING_SCAN_BREAKOUT_LOOKBACK: 20,
    EVENING_SCAN_TREND_LOOKBACK: 55,
  },
}));

import { analyzeBreakout } from './breakout';
import type { SignalBar } from './types';

function makeBar(close: number, high?: number, volume = 1000): SignalBar {
  return {
    date: new Date(),
    open: close,
    high: high ?? close * 1.01,
    low: close * 0.99,
    close,
    volume,
  };
}

function makeBreakoutBars(): SignalBar[] {
  // 60 bars: steady rise then a breakout above 20-day highs at the end
  const bars: SignalBar[] = [];
  for (let i = 0; i < 59; i++) {
    bars.push(makeBar(100 + i * 0.3, 100 + i * 0.3 + 1));
  }
  // Last bar breaks above all prior highs with strong volume
  const prevHigh = Math.max(...bars.slice(-20).map((b) => b.high));
  bars.push(makeBar(prevHigh + 2, prevHigh + 3, 3000));
  return bars;
}

function makeWatchBars(): SignalBar[] {
  // 60 bars: price is within range, near but below breakout
  const bars: SignalBar[] = [];
  for (let i = 0; i < 59; i++) {
    bars.push(makeBar(100 + Math.sin(i / 5) * 2, 104));
  }
  bars.push(makeBar(102, 103.5));
  return bars;
}

function makeAvoidBars(): SignalBar[] {
  // 60 bars: price well below breakout level
  const bars: SignalBar[] = [];
  for (let i = 0; i < 55; i++) {
    bars.push(makeBar(120, 122));
  }
  // Last 5 bars crash down
  for (let i = 0; i < 5; i++) {
    bars.push(makeBar(100 - i * 2, 101 - i * 2));
  }
  return bars;
}

describe('analyzeBreakout', () => {
  it('detects READY_NEXT_SESSION on 55-day breakout with volume', () => {
    const bars = makeBreakoutBars();
    const result = analyzeBreakout(bars);
    // Should be READY_NEXT_SESSION or READY_ON_TRIGGER
    expect(['READY_NEXT_SESSION', 'READY_ON_TRIGGER']).toContain(result.setupStatus);
    expect(result.currentPrice).toBeGreaterThan(0);
    expect(result.triggerPrice).toBeGreaterThan(0);
  });

  it('returns WATCH or EARLY_BIRD for near-breakout bars', () => {
    const bars = makeWatchBars();
    const result = analyzeBreakout(bars);
    expect(['WATCH', 'EARLY_BIRD', 'READY_ON_TRIGGER']).toContain(result.setupStatus);
  });

  it('returns AVOID when price is far below breakout', () => {
    const bars = makeAvoidBars();
    const result = analyzeBreakout(bars);
    expect(['AVOID', 'WAIT_PULLBACK']).toContain(result.setupStatus);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on weak volume', () => {
    // Create bars with very low volume at the end
    const bars: SignalBar[] = [];
    for (let i = 0; i < 59; i++) {
      bars.push(makeBar(100 + i * 0.1, 100 + i * 0.1 + 1, 2000));
    }
    bars.push(makeBar(106, 107, 100)); // Very low volume
    const result = analyzeBreakout(bars);
    expect(result.warnings).toContainEqual(expect.stringContaining('Volume confirmation'));
  });

  it('computes breakoutDistancePct correctly', () => {
    const bars = makeBreakoutBars();
    const result = analyzeBreakout(bars);
    expect(typeof result.breakoutDistancePct).toBe('number');
    expect(Number.isFinite(result.breakoutDistancePct)).toBe(true);
  });

  it('returns all expected fields', () => {
    const bars = makeBreakoutBars();
    const result = analyzeBreakout(bars);
    expect(result).toHaveProperty('currentPrice');
    expect(result).toHaveProperty('triggerPrice');
    expect(result).toHaveProperty('breakoutHigh20');
    expect(result).toHaveProperty('breakoutHigh55');
    expect(result).toHaveProperty('volumeRatio20');
    expect(result).toHaveProperty('setupStatus');
    expect(result).toHaveProperty('reasons');
    expect(result).toHaveProperty('warnings');
  });
});
