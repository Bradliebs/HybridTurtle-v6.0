// ============================================================
// PEAD Position Sizer — Satellite Position Sizing
// ============================================================
//
// PEAD positions are intentionally smaller than momentum
// positions. Base size is a fixed % of portfolio, adjusted
// by VIX multiplier and quality tier.
//
// Base sizing (% of portfolio):
//   weak   + no cross → 0.50%    weak   + cross → 0.75%
//   strong + no cross → 1.00%    strong + cross → 1.50%
//   conviction + no cross → 1.50%  conviction + cross → 2.00%
// ============================================================

import type { SignalStrength } from './pead-scanner';

const PREFIX = '[PEAD-SIZER]';

export interface PeadSizeResult {
  positionSizePct: number;
  baseSizePct: number;
  vixAdjusted: number;
  qualityAdjusted: number;
  skipped: boolean;
  skipReason?: string;
}

// ── Base sizing table ──

const BASE_SIZE: Record<SignalStrength, { solo: number; cross: number }> = {
  weak:       { solo: 0.50, cross: 0.75 },
  strong:     { solo: 1.00, cross: 1.50 },
  conviction: { solo: 1.50, cross: 2.00 },
};

/**
 * Calculate PEAD position size as % of portfolio value.
 *
 * @param signalStrength  - PEAD signal tier
 * @param crossConfirmed  - also flagged by main momentum scan
 * @param vixMultiplier   - from combined-risk-gate (1.0, 0.5, or 0.0)
 * @param qualityTier     - from quality-filter ('high'|'medium'|'low'|'junk'|'unknown')
 * @param portfolioValue  - total portfolio value (for absolute $ amount calculation)
 */
export function getPeadPositionSize(
  signalStrength: SignalStrength,
  crossConfirmed: boolean,
  vixMultiplier: number,
  qualityTier: string,
  portfolioValue: number
): PeadSizeResult {
  // Quality gate — skip junk/low entirely
  if (qualityTier === 'low' || qualityTier === 'junk') {
    return {
      positionSizePct: 0,
      baseSizePct: 0,
      vixAdjusted: 0,
      qualityAdjusted: 0,
      skipped: true,
      skipReason: `quality tier ${qualityTier} — PEAD entry skipped`,
    };
  }

  // Base size
  const tier = BASE_SIZE[signalStrength];
  const baseSizePct = crossConfirmed ? tier.cross : tier.solo;

  // VIX adjustment
  const vixAdjusted = baseSizePct * vixMultiplier;

  // Quality adjustment
  let qualityFactor = 1.0;
  if (qualityTier === 'medium') qualityFactor = 0.75;
  else if (qualityTier === 'unknown') qualityFactor = 0.50;
  // 'high' → 1.0 (no change)

  const qualityAdjusted = vixAdjusted * qualityFactor;
  const positionSizePct = Math.round(qualityAdjusted * 100) / 100;

  console.log(
    `${PREFIX} base=${baseSizePct}% vix=${vixAdjusted.toFixed(2)}% quality=${qualityAdjusted.toFixed(2)}% → ${positionSizePct}% of £${portfolioValue.toFixed(0)}`
  );

  return {
    positionSizePct,
    baseSizePct,
    vixAdjusted,
    qualityAdjusted,
    skipped: false,
  };
}
