// ============================================================
// Pairs Sizer — Long-Only Relative Value Position Sizing
// ============================================================
//
// LONG-ONLY MODE: Only the long leg is sized/traded.
// Base sizes are halved vs full pairs (unhedged = higher risk).
// ============================================================

import type { PairsSignal } from './pairs-scanner';

const PREFIX = '[PAIRS-SIZER]';

const MAX_OPEN_PAIRS = 10;
const MAX_PAIRS_ALLOCATION_PCT = 20;
const BASE_SIZE_PCT = 1.0; // Long-only: 1% per leg (halved from 2% full pairs)

export interface PairsSizeResult {
  positionSizePct: number;
  positionValueLong: number;
  longShares: number;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Calculate position size for a long-only relative value entry.
 */
export function getPairsPositionSize(
  signal: PairsSignal,
  portfolioValue: number,
  openPairsCount: number,
  vixMultiplier: number,
  longPrice: number
): PairsSizeResult {
  // Max pairs limit
  if (openPairsCount >= MAX_OPEN_PAIRS) {
    return { positionSizePct: 0, positionValueLong: 0, longShares: 0, skipped: true, skipReason: 'max pairs limit reached' };
  }

  let sizePct = BASE_SIZE_PCT;

  // Seed pair bonus: +25%
  if (signal.isSeedPair) sizePct *= 1.25;

  // Half-life adjustment
  if (signal.halfLife >= 10 && signal.halfLife <= 20) {
    // sweet spot — no change
  } else {
    sizePct *= 0.75;
  }

  // Cointegration strength
  if (signal.cointegrationPValue < 0.01) sizePct *= 1.1;
  else if (signal.cointegrationPValue > 0.05) sizePct *= 0.9;

  // VIX adjustment
  sizePct *= vixMultiplier;

  // Long-only reduction (already halved in BASE_SIZE_PCT, this is the explicit factor)
  // Already accounted for in BASE_SIZE_PCT = 1.0 instead of 2.0

  // Check total allocation
  const currentAllocation = openPairsCount * BASE_SIZE_PCT;
  if (currentAllocation + sizePct > MAX_PAIRS_ALLOCATION_PCT) {
    return { positionSizePct: 0, positionValueLong: 0, longShares: 0, skipped: true, skipReason: 'max pairs allocation exceeded' };
  }

  sizePct = Math.round(sizePct * 100) / 100;
  const positionValueLong = portfolioValue * (sizePct / 100);
  const longShares = longPrice > 0 ? Math.floor(positionValueLong / longPrice) : 0;

  console.log(
    `${PREFIX} ${signal.longTicker} (${signal.ticker1}/${signal.ticker2}) → ${sizePct}% = £${positionValueLong.toFixed(0)} = ${longShares} shares @ £${longPrice.toFixed(2)}`
  );

  return {
    positionSizePct: sizePct,
    positionValueLong,
    longShares,
    skipped: false,
  };
}
