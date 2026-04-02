// ============================================================
// Pairs Statistics — Pure Statistical Functions
// ============================================================
//
// All calculations for pairs trading. Pure functions — no DB,
// no Yahoo Finance, no side effects. Takes price series in,
// returns statistical results out.
//
// Implements:
//   - SSD (Gatev et al. 2006 distance method)
//   - Ornstein-Uhlenbeck half-life (Avellaneda & Lee 2010)
//   - Engle-Granger cointegration (simplified ADF)
//   - Pearson correlation
// ============================================================

// ── Constants ──

export const HALF_LIFE_MIN = 5;
export const HALF_LIFE_MAX = 30;
export const ENTRY_ZSCORE = 2.0;
export const EXIT_ZSCORE = 0.0;
export const STOP_ZSCORE = 4.0;

// ── Types ──

export interface SpreadStats {
  mean: number;
  std: number;
  zScore: number[];
}

export interface CointegrationResult {
  isCointegrated: boolean;
  pValue: number;
  testStatistic: number;
}

// ── Helpers ──

function normalise(series: number[]): number[] {
  if (series.length === 0) return [];
  const base = series[0];
  if (base === 0) return series.map(() => 0);
  return series.map((v) => (v / base) * 100);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ── SSD ──

/**
 * Sum of Squared Deviations between two normalised price series.
 * Lower SSD = more correlated movement.
 */
export function calculateSSD(series1: number[], series2: number[]): number {
  if (series1.length !== series2.length) {
    throw new Error(`Series length mismatch: ${series1.length} vs ${series2.length}`);
  }
  if (series1.length === 0) return 0;

  const norm1 = normalise(series1);
  const norm2 = normalise(series2);

  let ssd = 0;
  for (let i = 0; i < norm1.length; i++) {
    ssd += (norm1[i] - norm2[i]) ** 2;
  }
  return ssd;
}

// ── Spread ──

/**
 * Calculate element-wise spread between two normalised price series.
 */
export function calculateSpread(prices1: number[], prices2: number[]): number[] {
  if (prices1.length !== prices2.length) {
    throw new Error(`Series length mismatch: ${prices1.length} vs ${prices2.length}`);
  }

  const norm1 = normalise(prices1);
  const norm2 = normalise(prices2);

  return norm1.map((v, i) => v - norm2[i]);
}

// ── Spread Statistics ──

/**
 * Calculate spread mean, std, and z-score series.
 */
export function calculateSpreadStats(spread: number[]): SpreadStats {
  if (spread.length === 0) return { mean: 0, std: 0, zScore: [] };

  const m = mean(spread);
  const s = std(spread);

  const zScore = s > 0
    ? spread.map((v) => (v - m) / s)
    : spread.map(() => 0);

  return { mean: m, std: s, zScore };
}

// ── Current Z-Score ──

/**
 * Z-score for a single spread observation against formation parameters.
 */
export function getCurrentZScore(
  currentSpread: number,
  spreadMean: number,
  spreadStd: number
): number {
  if (spreadStd <= 0) return 0;
  return (currentSpread - spreadMean) / spreadStd;
}

// ── Correlation ──

/**
 * Pearson correlation coefficient (-1 to +1).
 */
export function calculateCorrelation(series1: number[], series2: number[]): number {
  if (series1.length !== series2.length || series1.length < 2) return 0;

  const n = series1.length;
  const m1 = mean(series1);
  const m2 = mean(series2);

  let cov = 0;
  let var1 = 0;
  let var2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = series1[i] - m1;
    const d2 = series2[i] - m2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  const denom = Math.sqrt(var1 * var2);
  if (denom === 0) return 0;
  return cov / denom;
}

// ── Half-Life (Ornstein-Uhlenbeck) ──

/**
 * Estimate mean-reversion half-life via OU regression.
 * Regress Δspread_t on spread_(t-1).
 * halfLife = -ln(2) / ln(1 + λ)
 * Returns Infinity if non-mean-reverting (λ >= 0).
 */
export function calculateHalfLife(spread: number[]): number {
  if (spread.length < 10) return Infinity;

  // Y = Δspread_t, X = spread_(t-1)
  const n = spread.length - 1;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 1; i <= n; i++) {
    const x = spread[i - 1];
    const y = spread[i] - spread[i - 1];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return Infinity;

  const lambda = (n * sumXY - sumX * sumY) / denom;

  // λ must be negative for mean-reversion
  if (lambda >= 0) return Infinity;

  const theta = 1 + lambda;
  if (theta <= 0 || theta >= 1) return Infinity;

  const halfLife = -Math.log(2) / Math.log(theta);

  return isFinite(halfLife) && halfLife > 0 ? halfLife : Infinity;
}

// ── Cointegration (Engle-Granger simplified ADF) ──

// ADF critical values (no trend, no intercept adjustment)
// MacKinnon (1996) approximate values for residual-based ADF
const ADF_CRITICAL = {
  '0.01': -3.43,
  '0.05': -2.86,
  '0.10': -2.57,
} as const;

/**
 * Simplified Engle-Granger cointegration test.
 * Step 1: OLS regression series1 = α + β × series2 + ε
 * Step 2: ADF test on residuals ε
 */
export function isCointegrated(
  series1: number[],
  series2: number[],
  significanceLevel: number = 0.05
): CointegrationResult {
  if (series1.length !== series2.length || series1.length < 30) {
    return { isCointegrated: false, pValue: 1.0, testStatistic: 0 };
  }

  const n = series1.length;

  // Step 1: OLS regression — series1 = α + β × series2
  const m1 = mean(series1);
  const m2 = mean(series2);

  let ssXY = 0;
  let ssX2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = series2[i] - m2;
    ssXY += (series1[i] - m1) * dx;
    ssX2 += dx * dx;
  }

  if (ssX2 === 0) return { isCointegrated: false, pValue: 1.0, testStatistic: 0 };
  const beta = ssXY / ssX2;
  const alpha = m1 - beta * m2;

  // Residuals
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    residuals.push(series1[i] - alpha - beta * series2[i]);
  }

  // Step 2: ADF test on residuals
  // Regress Δresidual_t = γ × residual_(t-1) + ε
  const rn = residuals.length - 1;
  let rSumX = 0;
  let rSumY = 0;
  let rSumXY = 0;
  let rSumX2 = 0;

  for (let i = 1; i <= rn; i++) {
    const x = residuals[i - 1];
    const y = residuals[i] - residuals[i - 1];
    rSumX += x;
    rSumY += y;
    rSumXY += x * y;
    rSumX2 += x * x;
  }

  const rDenom = rn * rSumX2 - rSumX * rSumX;
  if (rDenom === 0) return { isCointegrated: false, pValue: 1.0, testStatistic: 0 };

  const gamma = (rn * rSumXY - rSumX * rSumY) / rDenom;

  // Calculate standard error of γ
  const yHat: number[] = [];
  const gammaIntercept = (rSumY - gamma * rSumX) / rn;
  for (let i = 1; i <= rn; i++) {
    yHat.push(gammaIntercept + gamma * residuals[i - 1]);
  }

  let sse = 0;
  for (let i = 1; i <= rn; i++) {
    const e = (residuals[i] - residuals[i - 1]) - yHat[i - 1];
    sse += e * e;
  }

  const seGamma = Math.sqrt(sse / (rn - 1)) / Math.sqrt(rSumX2 - rSumX * rSumX / rn);
  if (!isFinite(seGamma) || seGamma === 0) {
    return { isCointegrated: false, pValue: 1.0, testStatistic: 0 };
  }

  const testStatistic = gamma / seGamma;

  // Map test statistic to approximate p-value
  let pValue: number;
  if (testStatistic <= ADF_CRITICAL['0.01']) {
    pValue = 0.005;
  } else if (testStatistic <= ADF_CRITICAL['0.05']) {
    pValue = 0.03;
  } else if (testStatistic <= ADF_CRITICAL['0.10']) {
    pValue = 0.07;
  } else {
    pValue = 0.50; // not significant
  }

  let threshold: number;
  if (significanceLevel <= 0.01) threshold = ADF_CRITICAL['0.01'];
  else if (significanceLevel <= 0.05) threshold = ADF_CRITICAL['0.05'];
  else threshold = ADF_CRITICAL['0.10'];

  return {
    isCointegrated: testStatistic <= threshold,
    pValue,
    testStatistic,
  };
}
