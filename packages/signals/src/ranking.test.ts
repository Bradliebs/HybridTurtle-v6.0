import { describe, expect, it } from 'vitest';
import { analyzeRiskFilter, rankCandidate } from './ranking';
import type { BreakoutAnalysis, RiskFilterAnalysis, SignalBar, TrendAnalysis } from './types';

function makeBar(close: number, high?: number, low?: number, volume = 1000): SignalBar {
  return {
    date: new Date(),
    open: close,
    high: high ?? close + 1,
    low: low ?? close - 1,
    close,
    volume,
  };
}

function makeBars(count: number, basePrice = 100): SignalBar[] {
  return Array.from({ length: count }, (_, i) =>
    makeBar(basePrice + i * 0.2, basePrice + i * 0.2 + 1.5, basePrice + i * 0.2 - 1.5)
  );
}

function makeBreakout(overrides: Partial<BreakoutAnalysis> = {}): BreakoutAnalysis {
  return {
    currentPrice: 105,
    triggerPrice: 106,
    breakoutHigh20: 106,
    breakoutHigh55: 108,
    volumeRatio20: 1.5,
    breakoutDistancePct: -0.9,
    setupStatus: 'READY_ON_TRIGGER',
    reasons: ['Near breakout level'],
    warnings: [],
    ...overrides,
  };
}

function makeTrend(overrides: Partial<TrendAnalysis> = {}): TrendAnalysis {
  return {
    sma20: 103,
    sma55: 100,
    ema21: 104,
    slope20: 5,
    trendScore: 70,
    isUptrend: true,
    reasons: ['Strong uptrend'],
    warnings: [],
    ...overrides,
  };
}

describe('analyzeRiskFilter', () => {
  it('passes for a normal setup with tight stop', () => {
    const bars = makeBars(20);
    const breakout = makeBreakout({ currentPrice: 104 });
    const result = analyzeRiskFilter(bars, breakout);

    expect(result.passes).toBe(true);
    expect(result.atr14).toBeGreaterThan(0);
    expect(result.initialStop).toBeLessThan(breakout.currentPrice);
    expect(result.stopDistancePercent).toBeLessThanOrEqual(10);
    expect(result.riskPerShare).toBeGreaterThan(0);
  });

  it('fails when stop distance exceeds 10%', () => {
    // Create bars with huge ATR (wild swings)
    const bars = Array.from({ length: 20 }, (_, i) =>
      makeBar(100 + i, 120 + i, 80 + i)
    );
    const breakout = makeBreakout({ currentPrice: 120 });
    const result = analyzeRiskFilter(bars, breakout);

    expect(result.stopDistancePercent).toBeGreaterThan(10);
    expect(result.passes).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('wide'));
  });

  it('returns all expected fields', () => {
    const bars = makeBars(20);
    const breakout = makeBreakout();
    const result = analyzeRiskFilter(bars, breakout);

    expect(result).toHaveProperty('atr14');
    expect(result).toHaveProperty('initialStop');
    expect(result).toHaveProperty('riskPerShare');
    expect(result).toHaveProperty('stopDistancePercent');
    expect(result).toHaveProperty('passes');
    expect(result).toHaveProperty('warnings');
  });
});

describe('rankCandidate', () => {
  const risk: RiskFilterAnalysis = {
    atr14: 2,
    initialStop: 100,
    riskPerShare: 5,
    stopDistancePercent: 4.76,
    passes: true,
    warnings: [],
  };

  it('awards highest bonus for READY_NEXT_SESSION', () => {
    const trend = makeTrend();
    const breakoutReady = makeBreakout({ setupStatus: 'READY_NEXT_SESSION' });
    const breakoutWatch = makeBreakout({ setupStatus: 'WATCH' });
    const readyResult = rankCandidate('AAPL', trend, breakoutReady, risk);
    const watchResult = rankCandidate('AAPL', trend, breakoutWatch, risk);

    expect(readyResult.rankScore).toBeGreaterThan(watchResult.rankScore);
  });

  it('penalizes AVOID status', () => {
    const trend = makeTrend();
    const breakout = makeBreakout({ setupStatus: 'AVOID' });
    const result = rankCandidate('BAD', trend, breakout, risk);

    expect(result.rankScore).toBeLessThan(trend.trendScore);
  });

  it('adds volume bonus capped at 8', () => {
    const trend = makeTrend({ trendScore: 50 });
    const lowVol = makeBreakout({ volumeRatio20: 0.5 });
    const highVol = makeBreakout({ volumeRatio20: 5 });
    const lowResult = rankCandidate('A', trend, lowVol, risk);
    const highResult = rankCandidate('A', trend, highVol, risk);

    expect(highResult.rankScore).toBeGreaterThan(lowResult.rankScore);
    // Volume bonus diff capped: max(5*4, 8) - 0.5*4 = 8 - 2 = 6
    expect(highResult.rankScore - lowResult.rankScore).toBeLessThanOrEqual(8);
  });

  it('penalizes wide stops', () => {
    const trend = makeTrend({ trendScore: 50 });
    const breakout = makeBreakout();
    const tightRisk: RiskFilterAnalysis = { ...risk, stopDistancePercent: 3 };
    const wideRisk: RiskFilterAnalysis = { ...risk, stopDistancePercent: 8 };
    const tightResult = rankCandidate('TIGHT', trend, breakout, tightRisk);
    const wideResult = rankCandidate('WIDE', trend, breakout, wideRisk);

    expect(tightResult.rankScore).toBeGreaterThan(wideResult.rankScore);
  });

  it('merges reasons and warnings from all analyses', () => {
    const trend = makeTrend({ reasons: ['Trend reason'], warnings: ['Trend warn'] });
    const breakout = makeBreakout({ reasons: ['Breakout reason'], warnings: ['Breakout warn'] });
    const riskWithWarn: RiskFilterAnalysis = { ...risk, warnings: ['Risk warn'] };
    const result = rankCandidate('MERGED', trend, breakout, riskWithWarn);

    expect(result.reasons).toContain('Trend reason');
    expect(result.reasons).toContain('Breakout reason');
    expect(result.warnings).toContain('Trend warn');
    expect(result.warnings).toContain('Breakout warn');
    expect(result.warnings).toContain('Risk warn');
  });

  it('returns correct symbol and prices', () => {
    const result = rankCandidate('TSLA', makeTrend(), makeBreakout({ currentPrice: 200, triggerPrice: 205 }), risk);
    expect(result.symbol).toBe('TSLA');
    expect(result.currentPrice).toBe(200);
    expect(result.triggerPrice).toBe(205);
  });
});
