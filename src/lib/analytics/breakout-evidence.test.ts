import { describe, expect, it } from 'vitest';
import {
  computeBucketStats,
  getOutcomeQueryRange,
  matchOutcomesToSnapshots,
} from './breakout-evidence';

describe('matchOutcomesToSnapshots', () => {
  it('matches outcomes by ticker and nearest scan date within 2 days', () => {
    const matches = matchOutcomesToSnapshots(
      [
        {
          ticker: 'AAA',
          createdAt: new Date('2026-03-10T12:00:00Z'),
          entropy63: 2.2,
          netIsolation: 0.6,
        },
      ],
      [
        {
          ticker: 'AAA',
          scanDate: new Date('2026-03-08T00:00:00Z'),
          fwdReturn5d: 1,
          fwdReturn10d: 2,
          fwdReturn20d: 3,
          mfeR: 1.2,
          maeR: -0.6,
          reached1R: true,
          stopHit: false,
        },
        {
          ticker: 'AAA',
          scanDate: new Date('2026-03-10T00:00:00Z'),
          fwdReturn5d: 4,
          fwdReturn10d: 5,
          fwdReturn20d: 6,
          mfeR: 1.8,
          maeR: -0.4,
          reached1R: true,
          stopHit: false,
        },
      ]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].outcome.fwdReturn5d).toBe(4);
  });

  it('does not match outcomes outside the allowed date window', () => {
    const matches = matchOutcomesToSnapshots(
      [
        {
          ticker: 'AAA',
          createdAt: new Date('2026-03-10T12:00:00Z'),
          entropy63: 2.2,
          netIsolation: 0.6,
        },
      ],
      [
        {
          ticker: 'AAA',
          scanDate: new Date('2026-03-20T00:00:00Z'),
          fwdReturn5d: 4,
          fwdReturn10d: 5,
          fwdReturn20d: 6,
          mfeR: 1.8,
          maeR: -0.4,
          reached1R: true,
          stopHit: false,
        },
      ]
    );

    expect(matches).toHaveLength(0);
  });

  it('uses each outcome at most once per ticker', () => {
    const matches = matchOutcomesToSnapshots(
      [
        {
          ticker: 'AAA',
          createdAt: new Date('2026-03-10T12:00:00Z'),
          entropy63: 2.2,
          netIsolation: 0.6,
        },
        {
          ticker: 'AAA',
          createdAt: new Date('2026-03-11T12:00:00Z'),
          entropy63: 2.1,
          netIsolation: 0.7,
        },
      ],
      [
        {
          ticker: 'AAA',
          scanDate: new Date('2026-03-10T00:00:00Z'),
          fwdReturn5d: 4,
          fwdReturn10d: 5,
          fwdReturn20d: 6,
          mfeR: 1.8,
          maeR: -0.4,
          reached1R: true,
          stopHit: false,
        },
      ]
    );

    expect(matches).toHaveLength(1);
  });
});

describe('breakout evidence helpers', () => {
  it('computes bucket stats using only matched outcomes', () => {
    const stats = computeBucketStats(
      [
        { entropy63: 2.1, netIsolation: 0.6 },
        { entropy63: 2.5, netIsolation: 0.4 },
      ],
      [
        {
          fwdReturn5d: 4,
          fwdReturn10d: 5,
          fwdReturn20d: 6,
          mfeR: 1.8,
          maeR: -0.4,
          reached1R: true,
          stopHit: false,
        },
      ]
    );

    expect(stats.count).toBe(2);
    expect(stats.withOutcomes).toBe(1);
    expect(stats.avgFwd5d).toBe(4);
    expect(stats.hit1RRate).toBe(100);
    expect(stats.stopHitRate).toBe(0);
  });

  it('builds a bounded outcome query range from snapshots', () => {
    const range = getOutcomeQueryRange([
      { createdAt: new Date('2026-03-10T00:00:00Z') },
      { createdAt: new Date('2026-03-12T00:00:00Z') },
    ]);

    expect(range).not.toBeNull();
    expect(range!.gte.toISOString()).toBe('2026-03-08T00:00:00.000Z');
    expect(range!.lte.toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });
});