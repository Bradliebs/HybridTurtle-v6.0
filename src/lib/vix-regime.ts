// ============================================================
// VIX Regime Module — Step 0 of Nightly Pipeline
// ============================================================
//
// Fetches ^VIX closing price from Yahoo Finance and returns a
// position-sizing multiplier based on the current volatility regime.
//
// Rules:
//   VIX < 20  → normal   → multiplier 1.0 (full sizing)
//   VIX 20–30 → elevated → multiplier 0.5 (half sizing)
//   VIX > 30  → crisis   → multiplier 0.0 (no new positions)
//
// On fetch failure: defaults to elevated / 0.5 (conservative).
// ============================================================

import YahooFinance from 'yahoo-finance2';
import prisma from '@/lib/prisma';

const yf = new (YahooFinance as unknown as new (opts: { suppressNotices: string[] }) => {
  quote(ticker: string): Promise<{ regularMarketPrice?: number } | null>;
})({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const PREFIX = '[VIX-REGIME]';
const TIMEOUT_MS = 5000;

export type VixRegimeLabel = 'normal' | 'elevated' | 'crisis';

export interface VixRegimeResult {
  vixClose: number;
  regime: VixRegimeLabel;
  multiplier: 1.0 | 0.5 | 0.0;
}

/**
 * Classify a VIX value into a regime with its sizing multiplier.
 */
export function classifyVix(vixClose: number): VixRegimeResult {
  if (vixClose > 30) return { vixClose, regime: 'crisis', multiplier: 0.0 };
  if (vixClose >= 20) return { vixClose, regime: 'elevated', multiplier: 0.5 };
  return { vixClose, regime: 'normal', multiplier: 1.0 };
}

const SAFE_DEFAULT: VixRegimeResult = { vixClose: 0, regime: 'elevated', multiplier: 0.5 };

/**
 * Fetch the VIX close from Yahoo Finance with a hard timeout,
 * classify the regime, persist a snapshot, and return the result.
 */
export async function getVixRegime(): Promise<VixRegimeResult> {
  let result: VixRegimeResult;

  try {
    const quote = await Promise.race([
      yf.quote('^VIX'),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('VIX fetch timed out')), TIMEOUT_MS)
      ),
    ]);

    const price = quote?.regularMarketPrice;
    if (price == null || price <= 0) {
      console.warn(`${PREFIX} Invalid VIX price received — using safe default`);
      result = SAFE_DEFAULT;
    } else {
      result = classifyVix(price);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`${PREFIX} Fetch failed: ${msg} — using safe default`);
    result = SAFE_DEFAULT;
  }

  // Persist snapshot
  try {
    await prisma.$transaction(async (tx) => {
      await tx.vixSnapshot.create({
        data: {
          date: new Date(),
          vixClose: result.vixClose,
          regime: result.regime,
          multiplier: result.multiplier,
        },
      });
    });
  } catch (dbError) {
    const msg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error(`${PREFIX} DB write failed: ${msg} — result still valid`);
  }

  console.log(
    `${PREFIX} VIX=${result.vixClose.toFixed(2)} regime=${result.regime} multiplier=${result.multiplier}`
  );

  return result;
}
