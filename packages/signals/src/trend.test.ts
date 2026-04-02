import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/src/env', () => ({
  env: {
    EVENING_SCAN_TREND_LOOKBACK: 55,
  },
}));

import { analyzeTrend } from './trend';
import type { SignalBar } from './types';

function makeBar(close: number, volume = 1000): SignalBar {
  return {
    date: new Date(),
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume,
  };
}

function makeBars(closes: number[]): SignalBar[] {
  return closes.map((c) => makeBar(c));
}

function makeUptrendBars(count = 60): SignalBar[] {
  // Steadily rising prices from 100 to 100+count
  return Array.from({ length: count }, (_, i) => makeBar(100 + i * 0.5));
}

function makeDowntrendBars(count = 60): SignalBar[] {
  // Steadily falling prices
  return Array.from({ length: count }, (_, i) => makeBar(200 - i * 0.5));
}

describe('analyzeTrend', () => {
  it('returns all components for a strong uptrend', () => {
    const bars = makeUptrendBars(60);
    const result = analyzeTrend(bars);

    expect(result.sma20).toBeGreaterThan(0);
    expect(result.sma55).toBeGreaterThan(0);
    expect(result.ema21).toBeGreaterThan(0);
    expect(result.isUptrend).toBe(true);
    expect(result.trendScore).toBeGreaterThanOrEqual(45); // 20+25 at minimum for uptrend
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('detects downtrend with negative slope', () => {
    const bars = makeDowntrendBars(60);
    const result = analyzeTrend(bars);

    expect(result.isUptrend).toBe(false);
    expect(result.slope20).toBeLessThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('gives +20 when price > SMA20', () => {
    // Last 20 bars average = 110, last close above that
    const bars = makeUptrendBars(60);
    const result = analyzeTrend(bars);
    expect(result.reasons).toContainEqual(expect.stringContaining('20-day average'));
  });

  it('gives +25 when price > SMA55', () => {
    const bars = makeUptrendBars(60);
    const result = analyzeTrend(bars);
    expect(result.reasons).toContainEqual(expect.stringContaining('55-day average'));
  });

  it('warns when 20-day slope is negative', () => {
    const bars = makeDowntrendBars(60);
    const result = analyzeTrend(bars);
    expect(result.warnings).toContainEqual(expect.stringContaining('slope has turned negative'));
    expect(result.trendScore).toBeLessThan(0);
  });

  it('handles minimal bar count gracefully', () => {
    const bars = makeBars([100, 101, 102]);
    const result = analyzeTrend(bars);
    expect(result.sma20).toBeGreaterThan(0);
  });
});
