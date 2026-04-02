// ============================================================
// Combined Risk Gate — VIX Regime + Seasonal Overlay
// ============================================================
//
// Thin orchestration layer that merges the VIX regime check and
// the Halloween seasonal overlay into a single gate result.
//
// Logic matrix:
//   seasonalRiskOff + crisis   → block, multiplier 0.0
//   seasonalRiskOff + elevated → block, multiplier 0.0
//   seasonalRiskOff + normal   → block, multiplier 0.5
//   winter          + any      → allow, multiplier from VIX
// ============================================================

import { getVixRegime } from '@/lib/vix-regime';
import type { VixRegimeResult } from '@/lib/vix-regime';
import { getSeasonalOverlay } from '@/lib/seasonal-overlay';
import prisma from '@/lib/prisma';

const PREFIX = '[COMBINED-RISK-GATE]';

export interface CombinedRiskGateResult {
  allowNewEntries: boolean;
  vixMultiplier: number;
  seasonalRiskOff: boolean;
  regime: string;
  season: string;
  reason: string;
}

export async function getCombinedRiskGate(): Promise<CombinedRiskGateResult> {
  const vix: VixRegimeResult = await getVixRegime();
  const seasonal = getSeasonalOverlay();

  let allowNewEntries: boolean;
  let vixMultiplier: number;
  let reason: string;

  if (seasonal.seasonalRiskOff) {
    // Summer — seasonal block active
    allowNewEntries = false;

    if (vix.regime === 'crisis') {
      vixMultiplier = 0.0;
      reason = `VIX crisis (${vix.vixClose.toFixed(1)}), summer seasonal active — full block`;
    } else if (vix.regime === 'elevated') {
      vixMultiplier = 0.0;
      reason = `VIX elevated (${vix.vixClose.toFixed(1)}), summer seasonal active — full block`;
    } else {
      // normal VIX but summer → still blocked, half multiplier for existing position management
      vixMultiplier = 0.5;
      reason = `VIX normal (${vix.vixClose.toFixed(1)}), summer seasonal active — entries blocked, half sizing`;
    }
  } else {
    // Winter — seasonal clear, defer to VIX
    allowNewEntries = vix.multiplier > 0;
    vixMultiplier = vix.multiplier;
    reason = `VIX ${vix.regime} (${vix.vixClose.toFixed(1)}), winter — seasonal clear`;
  }

  const result: CombinedRiskGateResult = {
    allowNewEntries,
    vixMultiplier,
    seasonalRiskOff: seasonal.seasonalRiskOff,
    regime: vix.regime,
    season: seasonal.season,
    reason,
  };

  // Persist seasonal snapshot
  try {
    await prisma.$transaction(async (tx) => {
      await tx.seasonalSnapshot.create({
        data: {
          date: new Date(),
          season: seasonal.season,
          seasonalRiskOff: seasonal.seasonalRiskOff,
        },
      });
    });
  } catch (dbError) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error(`${PREFIX} DB write failed: ${msg} — result still valid`);
  }

  console.log(`${PREFIX} ${reason}`);

  return result;
}
