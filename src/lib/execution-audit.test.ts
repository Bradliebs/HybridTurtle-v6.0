import { describe, expect, it } from 'vitest';
import {
  buildFallbackExecutionAuditRowFromPosition,
  calcSlippagePct,
  calcSlippageR,
  calcDiffPct,
  calcFillDelay,
  wouldViolateAntiChase,
  riskRulesMetPostFill,
  median,
  mean,
  MATERIAL_THRESHOLDS,
} from './execution-audit';

describe('execution-audit', () => {
  describe('calcSlippagePct', () => {
    it('positive slippage when fill > planned', () => {
      // Planned 100, filled at 100.50 → +0.5%
      expect(calcSlippagePct(100, 100.50)).toBeCloseTo(0.5, 3);
    });

    it('negative slippage when fill < planned (better fill)', () => {
      expect(calcSlippagePct(100, 99.50)).toBeCloseTo(-0.5, 3);
    });

    it('zero when fill matches plan', () => {
      expect(calcSlippagePct(100, 100)).toBe(0);
    });

    it('zero when planned is zero (guard)', () => {
      expect(calcSlippagePct(0, 50)).toBe(0);
    });
  });

  describe('calcSlippageR', () => {
    it('converts slippage to R-multiples', () => {
      // Planned 100, filled 101, initialR = 5 → slippage = 1/5 = 0.2R
      expect(calcSlippageR(100, 101, 5)).toBeCloseTo(0.2, 3);
    });

    it('negative R when better fill', () => {
      // Planned 100, filled 99, initialR = 5 → -1/5 = -0.2R
      expect(calcSlippageR(100, 99, 5)).toBeCloseTo(-0.2, 3);
    });

    it('zero when initialR is zero (guard)', () => {
      expect(calcSlippageR(100, 101, 0)).toBe(0);
    });
  });

  describe('calcDiffPct', () => {
    it('computes percentage difference', () => {
      expect(calcDiffPct(100, 110)).toBeCloseTo(10, 1);
    });

    it('negative when actual < expected', () => {
      expect(calcDiffPct(100, 90)).toBeCloseTo(-10, 1);
    });

    it('zero when expected is zero', () => {
      expect(calcDiffPct(0, 50)).toBe(0);
    });
  });

  describe('calcFillDelay', () => {
    it('returns delay in minutes', () => {
      const decision = new Date('2026-03-06T10:00:00Z');
      const fill = new Date('2026-03-06T10:05:00Z');
      expect(calcFillDelay(decision, fill)).toBeCloseTo(5, 1);
    });

    it('clamps to zero for negative (fill before decision)', () => {
      const decision = new Date('2026-03-06T10:05:00Z');
      const fill = new Date('2026-03-06T10:00:00Z');
      expect(calcFillDelay(decision, fill)).toBe(0);
    });
  });

  describe('wouldViolateAntiChase', () => {
    it('true when fill extends > 0.8 ATR above trigger', () => {
      // Trigger = 100, ATR = 5, fill = 105 → extATR = (105-100)/5 = 1.0 > 0.8
      expect(wouldViolateAntiChase(105, 100, 5)).toBe(true);
    });

    it('false when fill is within 0.8 ATR of trigger', () => {
      // Trigger = 100, ATR = 5, fill = 103 → extATR = 0.6 < 0.8
      expect(wouldViolateAntiChase(103, 100, 5)).toBe(false);
    });

    it('false when fill is below trigger', () => {
      expect(wouldViolateAntiChase(98, 100, 5)).toBe(false);
    });

    it('false when ATR is zero', () => {
      expect(wouldViolateAntiChase(105, 100, 0)).toBe(false);
    });
  });

  describe('riskRulesMetPostFill', () => {
    it('passes when risk within profile limit', () => {
      // £20 risk on £1000 equity = 2% ≤ 2% * 1.25 = 2.5% → pass
      expect(riskRulesMetPostFill(20, 1000, 2.0)).toBe(true);
    });

    it('passes with small overshoot within 25% tolerance', () => {
      // £24 risk on £1000 = 2.4% ≤ 2.5% → pass
      expect(riskRulesMetPostFill(24, 1000, 2.0)).toBe(true);
    });

    it('fails when risk exceeds limit + tolerance', () => {
      // £30 risk on £1000 = 3.0% > 2.5% → fail
      expect(riskRulesMetPostFill(30, 1000, 2.0)).toBe(false);
    });
  });

  describe('median', () => {
    it('odd count', () => expect(median([3, 1, 2])).toBe(2));
    it('even count', () => expect(median([4, 1, 3, 2])).toBe(2.5));
    it('empty', () => expect(median([])).toBe(0));
    it('single', () => expect(median([5])).toBe(5));
  });

  describe('mean', () => {
    it('computes mean', () => expect(mean([2, 4, 6])).toBe(4));
    it('null for empty', () => expect(mean([])).toBeNull());
  });

  describe('MATERIAL_THRESHOLDS', () => {
    it('slippage threshold is 0.5%', () => {
      expect(MATERIAL_THRESHOLDS.slippagePct).toBe(0.5);
    });

    it('stop diff threshold is 0.3%', () => {
      expect(MATERIAL_THRESHOLDS.stopDiffPct).toBe(0.3);
    });

    it('size diff threshold is 10%', () => {
      expect(MATERIAL_THRESHOLDS.sizeDiffPct).toBe(10);
    });

    it('slippage R threshold is 0.1R', () => {
      expect(MATERIAL_THRESHOLDS.slippageR).toBe(0.1);
    });
  });

  describe('buildFallbackExecutionAuditRowFromPosition', () => {
    it('builds a deterministic fallback row for positions without entry logs', () => {
      const row = buildFallbackExecutionAuditRowFromPosition(
        {
          id: 'pos-1',
          entryDate: new Date('2026-03-19T14:56:42.694Z'),
          entryPrice: 201.5,
          shares: 1.03,
          stopLoss: 191.425,
          currentStop: 191.425,
          initialRisk: 10.075,
          initial_stop: 191.425,
          initial_R: 10.075,
          stock: {
            ticker: 'CVX',
            sleeve: 'CORE',
          },
        },
        10000,
        2.0
      );

      expect(row.tradeLogId).toBe('fallback:pos-1');
      expect(row.ticker).toBe('CVX');
      expect(row.plannedEntry).toBeNull();
      expect(row.actualFill).toBe(201.5);
      expect(row.expectedStop).toBe(191.425);
      expect(row.actualInitialStop).toBe(191.425);
      expect(row.expectedShares).toBe(1.03);
      expect(row.actualShares).toBe(1.03);
      expect(row.slippagePct).toBeNull();
      expect(row.stopDiffPct).toBe(0);
      expect(row.sizeDiffPct).toBe(0);
      expect(row.riskDiffPct).toBe(0);
      expect(row.expectedRiskGbp).toBeCloseTo(10.38, 2);
      expect(row.actualRiskGbp).toBeCloseTo(10.38, 2);
      expect(row.riskRulesMetPostFill).toBe(true);
      expect(row.materialSlippage).toBe(false);
      expect(row.materialStopDiff).toBe(false);
      expect(row.materialSizeDiff).toBe(false);
    });
  });
});
