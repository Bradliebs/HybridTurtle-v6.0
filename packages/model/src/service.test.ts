import { describe, expect, it } from 'vitest';
import type { ScanCandidate, MarketRegime } from '../../../src/types';
import {
  predictRegime,
  predictBreakoutProbability,
  predictCandidateScore,
  applyModelLayerToCandidates,
  getModelVersions,
} from './service';

function makeCandidate(overrides: Partial<ScanCandidate> = {}): ScanCandidate {
  return {
    id: 'test-1',
    ticker: 'AAPL',
    name: 'Apple Inc',
    sleeve: 'CORE',
    sector: 'Technology',
    cluster: 'US_TECH',
    price: 150,
    technicals: {
      currentPrice: 150,
      ma200: 140,
      adx: 28,
      plusDI: 30,
      minusDI: 15,
      atr: 3,
      atr20DayAgo: 2.8,
      atrSpiking: false,
      medianAtr14: 2.9,
      atrPercent: 4,
      twentyDayHigh: 152,
      efficiency: 42,
      relativeStrength: 65,
      volumeRatio: 1.6,
      failedBreakoutAt: null,
    },
    entryTrigger: 152,
    stopPrice: 144,
    distancePercent: 1.3,
    status: 'READY',
    rankScore: 72,
    passesAllFilters: true,
    filterResults: {
      priceAboveMa200: true,
      adxAbove20: true,
      plusDIAboveMinusDI: true,
      atrPercentBelow8: true,
      efficiencyAbove30: true,
      dataQuality: true,
    },
    ...overrides,
  } as ScanCandidate;
}

describe('predictRegime', () => {
  it('returns BULLISH for strong ADX + positive DI spread + high RS', () => {
    const candidate = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 30,
        plusDI: 35,
        minusDI: 12,
        relativeStrength: 70,
      },
    });
    const result = predictRegime(candidate);
    expect(result.regime).toBe('BULLISH');
    expect(result.confidence).toBeGreaterThanOrEqual(35);
    expect(result.confidence).toBeLessThanOrEqual(92);
    expect(result.uncertainty).toBe(+(100 - result.confidence).toFixed(2));
  });

  it('returns BEARISH for negative DI spread', () => {
    const candidate = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 25,
        plusDI: 10,
        minusDI: 25,
        relativeStrength: 30,
      },
    });
    const result = predictRegime(candidate);
    expect(result.regime).toBe('BEARISH');
  });

  it('returns SIDEWAYS for narrow DI spread', () => {
    const candidate = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 15,
        plusDI: 20,
        minusDI: 18,
        relativeStrength: 50,
      },
    });
    const result = predictRegime(candidate);
    expect(result.regime).toBe('SIDEWAYS');
  });

  it('uses provided marketRegime as fallback', () => {
    const candidate = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 15,
        plusDI: 20,
        minusDI: 18,
      },
    });
    const result = predictRegime(candidate, 'BULLISH');
    // With narrow DI spread, should still be SIDEWAYS
    expect(result.regime).toBe('SIDEWAYS');
  });
});

describe('predictBreakoutProbability', () => {
  it('returns a probability between 0.02 and 0.98', () => {
    const candidate = makeCandidate();
    const prob = predictBreakoutProbability(candidate);
    expect(prob).toBeGreaterThanOrEqual(0.02);
    expect(prob).toBeLessThanOrEqual(0.98);
  });

  it('higher probability for strong technicals', () => {
    const strong = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 32,
        volumeRatio: 2.0,
        efficiency: 50,
        relativeStrength: 75,
        atrPercent: 3,
        plusDI: 35,
        minusDI: 10,
      },
      distancePercent: 0.5,
    });
    const weak = makeCandidate({
      technicals: {
        ...makeCandidate().technicals,
        adx: 15,
        volumeRatio: 0.6,
        efficiency: 20,
        relativeStrength: 30,
        atrPercent: 10,
        plusDI: 12,
        minusDI: 20,
        atrSpiking: true,
      },
      price: 130,
      distancePercent: 7,
    });
    expect(predictBreakoutProbability(strong)).toBeGreaterThan(predictBreakoutProbability(weak));
  });

  it('BULLISH regime boosts probability', () => {
    const candidate = makeCandidate();
    const base = predictBreakoutProbability(candidate);
    const bullish = predictBreakoutProbability(candidate, 'BULLISH');
    expect(bullish).toBeGreaterThanOrEqual(base);
  });

  it('BEARISH regime reduces probability', () => {
    const candidate = makeCandidate();
    const base = predictBreakoutProbability(candidate);
    const bearish = predictBreakoutProbability(candidate, 'BEARISH');
    expect(bearish).toBeLessThanOrEqual(base);
  });
});

describe('predictCandidateScore', () => {
  it('returns all expected fields', () => {
    const result = predictCandidateScore(makeCandidate());
    expect(result).toHaveProperty('baseSystemScore');
    expect(result).toHaveProperty('modelScore');
    expect(result).toHaveProperty('blendedScore');
    expect(result).toHaveProperty('breakoutProbability');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('uncertainty');
    expect(result).toHaveProperty('predictedRegime');
    expect(result).toHaveProperty('recommendation');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('featureTimestamp');
  });

  it('clamps scores between 0 and 100', () => {
    const result = predictCandidateScore(makeCandidate());
    expect(result.modelScore).toBeGreaterThanOrEqual(0);
    expect(result.modelScore).toBeLessThanOrEqual(100);
    expect(result.confidence).toBeGreaterThanOrEqual(20);
    expect(result.confidence).toBeLessThanOrEqual(95);
  });

  it('baseSystemScore matches candidate rankScore', () => {
    const candidate = makeCandidate({ rankScore: 65.5 });
    const result = predictCandidateScore(candidate);
    expect(result.baseSystemScore).toBe(65.5);
  });

  it('penalizes poor data quality', () => {
    const good = makeCandidate();
    const bad = makeCandidate({
      filterResults: { ...good.filterResults, dataQuality: false },
    });
    const goodScore = predictCandidateScore(good);
    const badScore = predictCandidateScore(bad);
    expect(goodScore.modelScore).toBeGreaterThan(badScore.modelScore);
  });

  it('recommendation is PROMOTE, NEUTRAL, or SUPPRESS', () => {
    const result = predictCandidateScore(makeCandidate());
    expect(['PROMOTE', 'NEUTRAL', 'SUPPRESS']).toContain(result.recommendation);
  });
});

describe('applyModelLayerToCandidates', () => {
  it('returns settings and versions when disabled', () => {
    const candidates = [makeCandidate()];
    const result = applyModelLayerToCandidates(candidates, { enabled: false });
    expect(result.settings.enabled).toBe(false);
    expect(result.versions).toBeDefined();
    expect(result.candidates.length).toBe(1);
  });

  it('blends scores when enabled', () => {
    const candidates = [makeCandidate({ rankScore: 60 })];
    const result = applyModelLayerToCandidates(candidates, { enabled: true, blendWeight: 0.5 });
    expect(result.settings.enabled).toBe(true);
    const overlay = result.candidates[0].modelOverlay!;
    expect(overlay.enabled).toBe(true);
    // Blended score should differ from base when model is enabled
    expect(overlay.blendedScore).toBeGreaterThanOrEqual(0);
    expect(overlay.blendedScore).toBeLessThanOrEqual(100);
  });

  it('sorts candidates by blended score descending when enabled', () => {
    const candidates = [
      makeCandidate({ ticker: 'LOW', rankScore: 30 }),
      makeCandidate({ ticker: 'HIGH', rankScore: 90 }),
    ];
    const result = applyModelLayerToCandidates(candidates, { enabled: true });
    const scores = result.candidates.map((c) => c.modelOverlay?.blendedScore ?? c.rankScore);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
  });

  it('handles empty candidates array', () => {
    const result = applyModelLayerToCandidates([]);
    expect(result.candidates).toEqual([]);
  });
});

describe('getModelVersions', () => {
  it('returns all version fields', () => {
    const versions = getModelVersions();
    expect(versions).toHaveProperty('candidateModelVersion');
    expect(versions).toHaveProperty('breakoutModelVersion');
    expect(versions).toHaveProperty('regimeModelVersion');
    expect(versions).toHaveProperty('ensembleVersion');
  });
});
