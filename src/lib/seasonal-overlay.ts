// ============================================================
// Seasonal Overlay — Halloween Effect (Bouman & Jacobsen 2002)
// ============================================================
//
// "Sell in May and go away" — blocks new long entries during the
// historically weaker May–October period.
//
// Rules:
//   Jan–Apr  (months 1–4)   → winter → seasonalRiskOff: false
//   May–Oct  (months 5–10)  → summer → seasonalRiskOff: true
//   Nov–Dec  (months 11–12) → winter → seasonalRiskOff: false
//
// UK (LSE): strict — no new longs during summer.
// US: softer — if VIX is 'normal' and caller opts in via
//     allowUsException, the block is lifted for US equities.
//
// Pure synchronous module — reads system date only.
// ============================================================

const PREFIX = '[SEASONAL-OVERLAY]';

export type Season = 'winter' | 'summer';
export type SeasonalMarket = 'normal' | 'cautious';

export interface SeasonalOverlayResult {
  seasonalRiskOff: boolean;
  season: Season;
  market: SeasonalMarket;
}

export interface SeasonalOverlayOptions {
  allowUsException?: boolean;
  /** Override date for testing — production callers should omit this. */
  _dateOverride?: Date;
}

/**
 * Classify the current month into a season and return the overlay.
 */
export function getSeasonalOverlay(
  options?: SeasonalOverlayOptions
): SeasonalOverlayResult {
  const now = options?._dateOverride ?? new Date();
  const month = now.getMonth() + 1; // 1-indexed

  const isSummer = month >= 5 && month <= 10;
  const season: Season = isSummer ? 'summer' : 'winter';
  let seasonalRiskOff = isSummer;

  // US exception: if caller opts in and we're in summer, allow entries
  // (the combined-risk-gate will only set allowUsException when VIX is normal)
  if (seasonalRiskOff && options?.allowUsException) {
    seasonalRiskOff = false;
  }

  const market: SeasonalMarket = seasonalRiskOff ? 'cautious' : 'normal';

  console.log(
    `${PREFIX} month=${month} season=${season} riskOff=${seasonalRiskOff} market=${market}`
  );

  return { seasonalRiskOff, season, market };
}

/**
 * Convenience check: is a new long entry allowed for the given market?
 *
 * LSE: blocked during summer (strict Halloween rule).
 * US:  blocked during summer UNLESS VIX regime is 'normal'.
 */
export function isNewEntryAllowed(
  market: 'LSE' | 'US',
  vixRegime: string,
  dateOverride?: Date
): boolean {
  const allowUsException = market === 'US' && vixRegime === 'normal';
  const result = getSeasonalOverlay({
    allowUsException,
    _dateOverride: dateOverride,
  });
  return !result.seasonalRiskOff;
}
