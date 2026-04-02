import { describe, expect, it } from 'vitest';
import { deriveScoresFromSnapshotTicker } from './score-backfill';
import { normaliseRow, scoreRow } from './dual-score';

describe('score-backfill', () => {
  it('derives BQS/FWS/NCS from SnapshotTicker fields', () => {
    const snapshot = {
      ticker: 'AAPL',
      name: 'Apple',
      sleeve: 'CORE',
      status: 'READY',
      currency: 'USD',
      close: 180,
      atr14: 3.5,
      atrPct: 1.94,
      adx14: 35,
      plusDi: 28,
      minusDi: 12,
      weeklyAdx: 32,
      volRatio: 1.8,
      marketRegime: 'BULLISH',
      marketRegimeStable: true,
      volRegime: 'LOW_VOL',
      dualRegimeAligned: true,
      distanceTo20dHighPct: 1.2,
      entryTrigger: 182,
      stopLevel: 176.75,
      chasing20Last5: false,
      chasing55Last5: false,
      atrSpiking: false,
      atrCollapsing: false,
      rsVsBenchmarkPct: 8.5,
      daysToEarnings: null,
      earningsInNext5d: false,
      clusterName: 'MEGA_CAP_TECH',
      superClusterName: 'US_GROWTH',
      clusterExposurePct: 12,
      superClusterExposurePct: 18,
      maxClusterPct: 25,
      maxSuperClusterPct: 35,
      bisScore: 8,
      createdAt: new Date('2026-03-18T21:27:29.400Z'),
    };

    const result = deriveScoresFromSnapshotTicker(snapshot);
    const expected = scoreRow(normaliseRow({
      ticker: snapshot.ticker,
      name: snapshot.name,
      sleeve: snapshot.sleeve,
      status: snapshot.status,
      currency: snapshot.currency,
      close: snapshot.close,
      atr_14: snapshot.atr14,
      atr_pct: snapshot.atrPct,
      adx_14: snapshot.adx14,
      plus_di: snapshot.plusDi,
      minus_di: snapshot.minusDi,
      weekly_adx: snapshot.weeklyAdx,
      vol_ratio: snapshot.volRatio,
      market_regime: snapshot.marketRegime,
      market_regime_stable: snapshot.marketRegimeStable,
      vol_regime: snapshot.volRegime,
      dual_regime_aligned: snapshot.dualRegimeAligned,
      distance_to_20d_high_pct: snapshot.distanceTo20dHighPct,
      entry_trigger: snapshot.entryTrigger,
      stop_level: snapshot.stopLevel,
      chasing_20_last5: snapshot.chasing20Last5,
      chasing_55_last5: snapshot.chasing55Last5,
      atr_spiking: snapshot.atrSpiking,
      atr_collapsing: snapshot.atrCollapsing,
      rs_vs_benchmark_pct: snapshot.rsVsBenchmarkPct,
      days_to_earnings: snapshot.daysToEarnings,
      earnings_in_next_5d: snapshot.earningsInNext5d,
      cluster_name: snapshot.clusterName,
      super_cluster_name: snapshot.superClusterName,
      cluster_exposure_pct: snapshot.clusterExposurePct,
      super_cluster_exposure_pct: snapshot.superClusterExposurePct,
      max_cluster_pct: snapshot.maxClusterPct,
      max_super_cluster_pct: snapshot.maxSuperClusterPct,
      bis_score: snapshot.bisScore,
    }));

    expect(result.bqs).toBe(expected.BQS);
    expect(result.fws).toBe(expected.FWS);
    expect(result.ncs).toBe(expected.NCS);
    expect(result.dualScoreAction).toBe('Auto-Yes');
  });

  it('marks fragile snapshots as Auto-No when derived FWS is above threshold', () => {
    const result = deriveScoresFromSnapshotTicker({
      ticker: 'XYZ',
      name: 'Fragile Name',
      sleeve: 'CORE',
      status: 'WATCH',
      currency: 'USD',
      close: 100,
      atr14: 7,
      atrPct: 7,
      adx14: 18,
      plusDi: 15,
      minusDi: 20,
      weeklyAdx: 18,
      volRatio: 0.5,
      marketRegime: 'SIDEWAYS',
      marketRegimeStable: false,
      volRegime: 'HIGH_VOL',
      dualRegimeAligned: false,
      distanceTo20dHighPct: 5,
      entryTrigger: 105,
      stopLevel: 95,
      chasing20Last5: true,
      chasing55Last5: true,
      atrSpiking: true,
      atrCollapsing: false,
      rsVsBenchmarkPct: -10,
      daysToEarnings: 1,
      earningsInNext5d: true,
      clusterName: null,
      superClusterName: null,
      clusterExposurePct: 0,
      superClusterExposurePct: 0,
      maxClusterPct: 0,
      maxSuperClusterPct: 0,
      bisScore: 0,
      createdAt: new Date('2026-03-18T21:27:29.400Z'),
    });

    expect(result.fws).toBeGreaterThan(65);
    expect(result.dualScoreAction).toBe('Auto-No');
  });
});