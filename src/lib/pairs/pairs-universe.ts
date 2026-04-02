// ============================================================
// Pairs Universe — Seed Pairs & Algorithmic Discovery
// ============================================================
//
// LONG-ONLY MODE: T212 ISA/Invest accounts do not support
// short selling. This module operates in long-only relative
// value mode throughout.
// ============================================================

const PREFIX = '[PAIRS-MODULE]';

export interface SeedPair {
  ticker1: string;
  ticker2: string;
  market: 'LSE' | 'US';
  sector: string;
}

// ── Seed Pairs ──

const LSE_SEED_PAIRS: SeedPair[] = [
  { ticker1: 'BARC.L', ticker2: 'LLOY.L', market: 'LSE', sector: 'Financial Services' },
  { ticker1: 'HSBA.L', ticker2: 'STAN.L', market: 'LSE', sector: 'Financial Services' },
  { ticker1: 'RIO.L', ticker2: 'BHP.L', market: 'LSE', sector: 'Basic Materials' },
  { ticker1: 'AAL.L', ticker2: 'GLEN.L', market: 'LSE', sector: 'Basic Materials' },
  { ticker1: 'BP.L', ticker2: 'SHEL.L', market: 'LSE', sector: 'Energy' },
  { ticker1: 'TSCO.L', ticker2: 'SBRY.L', market: 'LSE', sector: 'Consumer Defensive' },
  { ticker1: 'MKS.L', ticker2: 'NXT.L', market: 'LSE', sector: 'Consumer Cyclical' },
  { ticker1: 'AZN.L', ticker2: 'GSK.L', market: 'LSE', sector: 'Healthcare' },
];

const US_SEED_PAIRS: SeedPair[] = [
  { ticker1: 'MSFT', ticker2: 'GOOGL', market: 'US', sector: 'Technology' },
  { ticker1: 'AMD', ticker2: 'NVDA', market: 'US', sector: 'Technology' },
  { ticker1: 'META', ticker2: 'SNAP', market: 'US', sector: 'Technology' },
  { ticker1: 'JPM', ticker2: 'BAC', market: 'US', sector: 'Financial Services' },
  { ticker1: 'GS', ticker2: 'MS', market: 'US', sector: 'Financial Services' },
  { ticker1: 'KO', ticker2: 'PEP', market: 'US', sector: 'Consumer Defensive' },
  { ticker1: 'MCD', ticker2: 'YUM', market: 'US', sector: 'Consumer Cyclical' },
];

export function getSeedPairs(): SeedPair[] {
  return [...LSE_SEED_PAIRS, ...US_SEED_PAIRS];
}

export function isSeedPair(ticker1: string, ticker2: string): boolean {
  const seeds = getSeedPairs();
  return seeds.some(
    (s) =>
      (s.ticker1 === ticker1 && s.ticker2 === ticker2) ||
      (s.ticker1 === ticker2 && s.ticker2 === ticker1)
  );
}

export function logStartupMode(): void {
  console.warn(
    `${PREFIX} Running in LONG-ONLY mode — short selling unavailable on T212 ISA/Invest`
  );
}
