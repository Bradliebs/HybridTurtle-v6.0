import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AccountRiskState } from './types';

// Mock the config env before importing the module under test
vi.mock('../../config/src/env', () => ({
  env: {
    EVENING_PLAN_RISK_PER_TRADE_PCT: 0.005,
  },
}));

import { calculateTradeSize, round } from './sizing';
import { assessTradeRisk } from './validation';

function makeState(overrides: Partial<AccountRiskState> = {}): AccountRiskState {
  return {
    accountEquity: 10_000,
    cashBalance: 5_000,
    totalMarketValue: 5_000,
    openPositionCount: 1,
    totalOpenRisk: 200,
    openRiskPct: 2.0,
    concentrations: [],
    missingStopCount: 0,
    ...overrides,
  };
}

describe('calculateTradeSize', () => {
  it('calculates shares correctly for a standard long setup', () => {
    const result = calculateTradeSize('AAPL', 150, 145, makeState());
    expect(result.symbol).toBe('AAPL');
    expect(result.riskPerShare).toBe(5);
    expect(result.recommendedShares).toBe(10); // floor(50 / 5) = 10
    expect(result.positionValue).toBe(1500); // 10 * 150
    expect(result.stopDistancePct).toBeCloseTo(3.3333, 2);
  });

  it('floors shares down — never rounds up', () => {
    // riskBudget = 10000 * 0.005 = 50, riskPerShare = 7
    // shares = floor(50 / 7) = 7 (not 8)
    const result = calculateTradeSize('TEST', 100, 93, makeState());
    expect(result.recommendedShares).toBe(7);
  });

  it('returns 0 shares when equity is too low', () => {
    const state = makeState({ accountEquity: 100, cashBalance: 100 });
    // riskBudget = 100 * 0.005 = 0.50, riskPerShare = 5
    // shares = floor(0.50 / 5) = 0
    const result = calculateTradeSize('EXP', 150, 145, state);
    expect(result.recommendedShares).toBe(0);
  });

  it('caps shares by cash balance', () => {
    // Cash = 200, entry = 150 → max 1 share by cash
    // riskBudget = 10000 * 0.005 = 50, riskPerShare = 5 → 10 by risk
    // min(10, 1) = 1
    const state = makeState({ cashBalance: 200 });
    const result = calculateTradeSize('LOW', 150, 145, state);
    expect(result.recommendedShares).toBe(1);
  });

  it('handles entry == stop gracefully (riskPerShare = 0.01 floor)', () => {
    const result = calculateTradeSize('EDGE', 100, 100, makeState());
    // riskPerShare = max(0, 0.01) = 0.01
    expect(result.riskPerShare).toBe(0.01);
    // Should still produce a valid number (floor(50 / 0.01) = 5000, capped by cash)
    expect(result.recommendedShares).toBeGreaterThanOrEqual(0);
  });

  it('handles zero entry price', () => {
    const result = calculateTradeSize('ZERO', 0, 0, makeState());
    expect(result.recommendedShares).toBe(0);
    expect(result.stopDistancePct).toBe(0);
  });

  it('accumulates open risk correctly', () => {
    const state = makeState({ totalOpenRisk: 500 });
    const result = calculateTradeSize('ACC', 100, 95, state);
    expect(result.openRiskAfterTrade).toBe(round(500 + result.recommendedShares * 5));
  });
});

describe('round', () => {
  it('rounds to 4 decimal places by default', () => {
    expect(round(1.23456789)).toBe(1.2346);
  });

  it('respects custom precision', () => {
    expect(round(1.23456789, 2)).toBe(1.23);
  });
});

describe('assessTradeRisk', () => {
  it('approves a valid trade', () => {
    const result = assessTradeRisk('AAPL', 150, 145, makeState());
    expect(result.approved).toBe(true);
    expect(result.violations.filter(v => v.severity === 'HARD')).toHaveLength(0);
  });

  it('blocks when shares < 1 (insufficient capital)', () => {
    const state = makeState({ accountEquity: 50, cashBalance: 50 });
    const result = assessTradeRisk('EXP', 150, 145, state);
    expect(result.approved).toBe(false);
    expect(result.violations.some(v => v.rule === 'MIN_SHARES')).toBe(true);
  });

  it('blocks when max positions exceeded', () => {
    const state = makeState({ openPositionCount: 4 });
    const result = assessTradeRisk('FULL', 100, 95, state);
    expect(result.approved).toBe(false);
    expect(result.violations.some(v => v.rule === 'MAX_POSITIONS')).toBe(true);
  });

  it('blocks when stop distance too wide', () => {
    // stopDistancePct = (50 - 40) / 50 * 100 = 20% > 10%
    const result = assessTradeRisk('WIDE', 50, 40, makeState());
    expect(result.approved).toBe(false);
    expect(result.violations.some(v => v.rule === 'STOP_DISTANCE')).toBe(true);
  });

  it('blocks when stop >= entry', () => {
    const result = assessTradeRisk('BAD', 100, 105, makeState());
    expect(result.violations.some(v => v.rule === 'STOP_BELOW_ENTRY')).toBe(true);
  });

  it('blocks when open risk exceeds max', () => {
    const state = makeState({ totalOpenRisk: 960, accountEquity: 10_000 });
    // Adding ~50 more → 1010/10000 = 10.1% > 10%
    const result = assessTradeRisk('RISK', 100, 95, state);
    expect(result.violations.some(v => v.rule === 'MAX_OPEN_RISK')).toBe(true);
  });

  it('adds soft warning for missing stops', () => {
    const state = makeState({ missingStopCount: 2 });
    const result = assessTradeRisk('WARN', 100, 95, state);
    const softWarning = result.violations.find(v => v.rule === 'MISSING_STOPS');
    expect(softWarning).toBeDefined();
    expect(softWarning!.severity).toBe('SOFT');
    // Soft warnings don't block
    expect(result.approved).toBe(true);
  });

  it('adds concentration violation when position too large', () => {
    // totalMarketValue = 100, new position = 10 * 100 = 1000
    // weight = 1000 / (100 + 1000) = 91% > 30%
    const state = makeState({ totalMarketValue: 100 });
    const result = assessTradeRisk('BIG', 100, 95, state);
    expect(result.violations.some(v => v.rule === 'CONCENTRATION')).toBe(true);
  });
});
