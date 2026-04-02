import { describe, expect, it } from 'vitest';
import { buildSyncedEntryTradeLogData } from './synced-entry-trade-log';

describe('buildSyncedEntryTradeLogData', () => {
  it('maps a synced position into a TradeLog ENTRY payload', () => {
    const entryDate = new Date('2026-03-19T13:39:53.549Z');
    const data = buildSyncedEntryTradeLogData({
      userId: 'user-1',
      positionId: 'pos-1',
      ticker: 'OXY',
      entryDate,
      entryPrice: 59.67142857,
      shares: 3.5,
      stopLoss: 56.6878571415,
      initialRisk: 2.9835714285,
      atrAtEntry: null,
      accountType: 'invest',
      isin: 'US6745991058',
    });

    expect(data.userId).toBe('user-1');
    expect(data.positionId).toBe('pos-1');
    expect(data.ticker).toBe('OXY');
    expect(data.tradeDate).toBe(entryDate);
    expect(data.tradeType).toBe('ENTRY');
    expect(data.decision).toBe('TAKEN');
    expect(data.decisionReason).toContain('Trading 212 (INVEST)');
    expect(data.decisionReason).toContain('US6745991058');
    expect(data.entryPrice).toBeCloseTo(59.67142857, 8);
    expect(data.initialStop).toBeCloseTo(56.6878571415, 8);
    expect(data.initialR).toBeCloseTo(2.9835714285, 8);
    expect(data.shares).toBe(3.5);
    expect(data.plannedEntry).toBeNull();
    expect(data.actualFill).toBeCloseTo(59.67142857, 8);
    expect(data.slippagePct).toBeNull();
    expect(data.fillTime).toBe(entryDate);
  });
});