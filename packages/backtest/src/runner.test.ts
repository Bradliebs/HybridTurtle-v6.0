import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    snapshot: {
      findMany: vi.fn(),
    },
    snapshotTicker: {
      findMany: vi.fn(),
    },
  },
  scoreRow: vi.fn(() => ({
    BQS: 72,
    FWS: 18,
    NCS: 58,
    ActionNote: 'Conditional',
  })),
  calcBPSFromSnapshot: vi.fn(() => ({ bps: 11 })),
  computeRsPercentiles: vi.fn((rows: Array<{ ticker: string }>) => new Map(rows.map((row) => [row.ticker, 50]))),
}));

vi.mock('../../data/src/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../../src/lib/dual-score', () => ({
  scoreRow: mocks.scoreRow,
}));

vi.mock('../../../src/lib/breakout-probability', () => ({
  calcBPSFromSnapshot: mocks.calcBPSFromSnapshot,
  computeRsPercentiles: mocks.computeRsPercentiles,
}));

import { runBacktest } from './runner';

function makeSnapshot(id: string, iso: string) {
  return {
    id,
    createdAt: new Date(iso),
  };
}

function makeRow(overrides: Partial<{
  snapshotId: string;
  ticker: string;
  name: string;
  sleeve: string;
  status: string;
  currency: string;
  close: number;
  atr14: number;
  atrPct: number;
  adx14: number;
  plusDi: number;
  minusDi: number;
  weeklyAdx: number;
  volRatio: number;
  dollarVol20: number;
  liquidityOk: boolean;
  bisScore: number;
  marketRegime: string;
  marketRegimeStable: boolean;
  volRegime: string;
  dualRegimeAligned: boolean;
  high20: number;
  high55: number;
  distanceTo20dHighPct: number;
  distanceTo55dHighPct: number;
  entryTrigger: number;
  stopLevel: number;
  chasing20Last5: boolean;
  chasing55Last5: boolean;
  atrSpiking: boolean;
  atrCollapsing: boolean;
  atrCompressionRatio: number | null;
  rsVsBenchmarkPct: number;
  daysToEarnings: number | null;
  earningsInNext5d: boolean;
  clusterName: string;
  superClusterName: string;
  clusterExposurePct: number;
  superClusterExposurePct: number;
  maxClusterPct: number;
  maxSuperClusterPct: number;
  createdAt: Date;
}>) {
  return {
    snapshotId: 's1',
    ticker: 'AAA',
    name: 'Alpha',
    sleeve: 'CORE',
    status: 'FAR',
    currency: 'USD',
    close: 95,
    atr14: 2,
    atrPct: 2,
    adx14: 25,
    plusDi: 22,
    minusDi: 15,
    weeklyAdx: 20,
    volRatio: 1.2,
    dollarVol20: 1_000_000,
    liquidityOk: true,
    bisScore: 0,
    marketRegime: 'BULLISH',
    marketRegimeStable: true,
    volRegime: 'NORMAL_VOL',
    dualRegimeAligned: true,
    high20: 100,
    high55: 105,
    distanceTo20dHighPct: 5,
    distanceTo55dHighPct: 8,
    entryTrigger: 100,
    stopLevel: 90,
    chasing20Last5: false,
    chasing55Last5: false,
    atrSpiking: false,
    atrCollapsing: false,
    atrCompressionRatio: null,
    rsVsBenchmarkPct: 4,
    daysToEarnings: null,
    earningsInNext5d: false,
    clusterName: 'Tech',
    superClusterName: 'Growth',
    clusterExposurePct: 5,
    superClusterExposurePct: 5,
    maxClusterPct: 20,
    maxSuperClusterPct: 25,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('runBacktest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens a trade when a ticker first enters the READY/WATCH band', async () => {
    mocks.prisma.snapshot.findMany.mockResolvedValue([
      makeSnapshot('s1', '2026-01-01T00:00:00.000Z'),
      makeSnapshot('s2', '2026-01-02T00:00:00.000Z'),
      makeSnapshot('s3', '2026-01-03T00:00:00.000Z'),
      makeSnapshot('s4', '2026-01-04T00:00:00.000Z'),
    ]);
    mocks.prisma.snapshotTicker.findMany.mockResolvedValue([
      makeRow({ snapshotId: 's1', createdAt: new Date('2026-01-01T00:00:00.000Z'), status: 'FAR', close: 95 }),
      makeRow({ snapshotId: 's2', createdAt: new Date('2026-01-02T00:00:00.000Z'), status: 'READY', close: 99 }),
      makeRow({ snapshotId: 's3', createdAt: new Date('2026-01-03T00:00:00.000Z'), status: 'READY', close: 99.2 }),
      makeRow({ snapshotId: 's4', createdAt: new Date('2026-01-04T00:00:00.000Z'), status: 'READY', close: 102 }),
    ]);

    const result = await runBacktest({
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-04T00:00:00.000Z'),
    });

    expect(result.summary.signalCount).toBe(1);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]?.signalDate).toBe('2026-01-02T00:00:00.000Z');
    expect(result.trades[0]?.entryPrice).toBe(100);
    expect(result.trades[0]?.riskPerShare).toBe(10);
  });

  it('treats a jump straight into a triggered READY row as a single setup signal', async () => {
    mocks.prisma.snapshot.findMany.mockResolvedValue([
      makeSnapshot('s1', '2026-01-01T00:00:00.000Z'),
      makeSnapshot('s2', '2026-01-02T00:00:00.000Z'),
      makeSnapshot('s3', '2026-01-03T00:00:00.000Z'),
    ]);
    mocks.prisma.snapshotTicker.findMany.mockResolvedValue([
      makeRow({ snapshotId: 's1', createdAt: new Date('2026-01-01T00:00:00.000Z'), status: 'FAR', close: 95 }),
      makeRow({ snapshotId: 's2', createdAt: new Date('2026-01-02T00:00:00.000Z'), status: 'READY', close: 101 }),
      makeRow({ snapshotId: 's3', createdAt: new Date('2026-01-03T00:00:00.000Z'), status: 'READY', close: 103 }),
    ]);

    const result = await runBacktest({
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-03T00:00:00.000Z'),
    });

    expect(result.summary.signalCount).toBe(1);
    expect(result.trades[0]?.signalDate).toBe('2026-01-02T00:00:00.000Z');
    expect(result.trades[0]?.entryPrice).toBe(100);
  });

  it('excludes WAIT_PULLBACK rows from breakout setup signals', async () => {
    mocks.prisma.snapshot.findMany.mockResolvedValue([
      makeSnapshot('s1', '2026-01-01T00:00:00.000Z'),
      makeSnapshot('s2', '2026-01-02T00:00:00.000Z'),
    ]);
    mocks.prisma.snapshotTicker.findMany.mockResolvedValue([
      makeRow({ snapshotId: 's1', createdAt: new Date('2026-01-01T00:00:00.000Z'), status: 'FAR', close: 95 }),
      makeRow({ snapshotId: 's2', createdAt: new Date('2026-01-02T00:00:00.000Z'), status: 'WAIT_PULLBACK', close: 104 }),
    ]);

    const result = await runBacktest({
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(result.summary.signalCount).toBe(0);
    expect(result.trades).toEqual([]);
  });

  it('maps legacy sleeve aliases to canonical snapshot sleeve values', async () => {
    mocks.prisma.snapshot.findMany.mockResolvedValue([
      makeSnapshot('s1', '2026-01-01T00:00:00.000Z'),
      makeSnapshot('s2', '2026-01-02T00:00:00.000Z'),
    ]);
    mocks.prisma.snapshotTicker.findMany.mockResolvedValue([
      makeRow({ snapshotId: 's1', createdAt: new Date('2026-01-01T00:00:00.000Z'), sleeve: 'CORE', status: 'FAR' }),
      makeRow({ snapshotId: 's2', createdAt: new Date('2026-01-02T00:00:00.000Z'), sleeve: 'CORE', status: 'READY', close: 99 }),
    ]);

    const result = await runBacktest({
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-02T00:00:00.000Z'),
      sleeve: 'STOCK_CORE',
    });

    expect(mocks.prisma.snapshotTicker.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        sleeve: 'CORE',
      }),
    }));
    expect(result.summary.signalCount).toBe(1);
  });
});