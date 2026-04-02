import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSeasonalOverlay, isNewEntryAllowed } from './seasonal-overlay';

// ── getSeasonalOverlay — month boundary tests ──

describe('getSeasonalOverlay', () => {
  it('month 1 (Jan) → winter, riskOff false', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 0, 15) });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'winter', market: 'normal' });
  });

  it('month 4 (Apr) → winter, riskOff false', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 3, 30) });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'winter', market: 'normal' });
  });

  it('month 5 (May) → summer, riskOff true', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 4, 1) });
    expect(result).toEqual({ seasonalRiskOff: true, season: 'summer', market: 'cautious' });
  });

  it('month 10 (Oct) → summer, riskOff true', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 9, 31) });
    expect(result).toEqual({ seasonalRiskOff: true, season: 'summer', market: 'cautious' });
  });

  it('month 11 (Nov) → winter, riskOff false', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 10, 1) });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'winter', market: 'normal' });
  });

  it('month 12 (Dec) → winter, riskOff false', () => {
    const result = getSeasonalOverlay({ _dateOverride: new Date(2026, 11, 25) });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'winter', market: 'normal' });
  });

  it('summer + allowUsException → riskOff false (US exception)', () => {
    const result = getSeasonalOverlay({
      allowUsException: true,
      _dateOverride: new Date(2026, 6, 15), // July
    });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'summer', market: 'normal' });
  });

  it('summer + no allowUsException → riskOff true', () => {
    const result = getSeasonalOverlay({
      allowUsException: false,
      _dateOverride: new Date(2026, 6, 15),
    });
    expect(result).toEqual({ seasonalRiskOff: true, season: 'summer', market: 'cautious' });
  });

  it('winter + allowUsException → riskOff false (no effect in winter)', () => {
    const result = getSeasonalOverlay({
      allowUsException: true,
      _dateOverride: new Date(2026, 1, 15), // Feb
    });
    expect(result).toEqual({ seasonalRiskOff: false, season: 'winter', market: 'normal' });
  });
});

// ── isNewEntryAllowed — market + regime combos ──

describe('isNewEntryAllowed', () => {
  // Winter — all allowed regardless of market or VIX
  it('LSE + winter + normal → allowed', () => {
    expect(isNewEntryAllowed('LSE', 'normal', new Date(2026, 1, 15))).toBe(true);
  });

  it('US + winter + crisis → allowed', () => {
    expect(isNewEntryAllowed('US', 'crisis', new Date(2026, 1, 15))).toBe(true);
  });

  // Summer LSE — always blocked (strict Halloween rule)
  it('LSE + summer + normal → BLOCKED', () => {
    expect(isNewEntryAllowed('LSE', 'normal', new Date(2026, 6, 15))).toBe(false);
  });

  it('LSE + summer + elevated → BLOCKED', () => {
    expect(isNewEntryAllowed('LSE', 'elevated', new Date(2026, 6, 15))).toBe(false);
  });

  it('LSE + summer + crisis → BLOCKED', () => {
    expect(isNewEntryAllowed('LSE', 'crisis', new Date(2026, 6, 15))).toBe(false);
  });

  // Summer US — exception only when VIX is normal
  it('US + summer + normal → ALLOWED (US exception)', () => {
    expect(isNewEntryAllowed('US', 'normal', new Date(2026, 6, 15))).toBe(true);
  });

  it('US + summer + elevated → BLOCKED', () => {
    expect(isNewEntryAllowed('US', 'elevated', new Date(2026, 6, 15))).toBe(false);
  });

  it('US + summer + crisis → BLOCKED', () => {
    expect(isNewEntryAllowed('US', 'crisis', new Date(2026, 6, 15))).toBe(false);
  });
});

// ── getCombinedRiskGate — 6 regime × season combos ──

// Mock VIX regime
vi.mock('@/lib/vix-regime', () => ({
  getVixRegime: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        seasonalSnapshot: { create: vi.fn().mockResolvedValue({}) },
        vixSnapshot: { create: vi.fn().mockResolvedValue({}) },
      });
    }),
  },
}));

describe('getCombinedRiskGate', () => {
  let getCombinedRiskGate: () => Promise<{
    allowNewEntries: boolean;
    vixMultiplier: number;
    seasonalRiskOff: boolean;
    regime: string;
    season: string;
    reason: string;
  }>;
  let mockGetVixRegime: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const vixMod = await import('@/lib/vix-regime');
    mockGetVixRegime = vixMod.getVixRegime as ReturnType<typeof vi.fn>;
    const mod = await import('./combined-risk-gate');
    getCombinedRiskGate = mod.getCombinedRiskGate;
  });

  // --- Winter (months 1-4, 11-12): seasonal clear, defers to VIX ---

  it('winter + normal → allow, multiplier 1.0', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 15, regime: 'normal', multiplier: 1.0 });
    vi.useFakeTimers({ now: new Date(2026, 1, 15) }); // Feb
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(true);
    expect(result.vixMultiplier).toBe(1.0);
    expect(result.seasonalRiskOff).toBe(false);
    expect(result.season).toBe('winter');
    expect(result.regime).toBe('normal');
  });

  it('winter + elevated → allow, multiplier 0.5', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 25, regime: 'elevated', multiplier: 0.5 });
    vi.useFakeTimers({ now: new Date(2026, 11, 10) }); // Dec
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(true);
    expect(result.vixMultiplier).toBe(0.5);
    expect(result.seasonalRiskOff).toBe(false);
    expect(result.season).toBe('winter');
  });

  it('winter + crisis → block, multiplier 0.0', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 40, regime: 'crisis', multiplier: 0.0 });
    vi.useFakeTimers({ now: new Date(2026, 0, 5) }); // Jan
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(false);
    expect(result.vixMultiplier).toBe(0.0);
    expect(result.seasonalRiskOff).toBe(false);
    expect(result.season).toBe('winter');
  });

  // --- Summer (months 5-10): seasonal block active ---

  it('summer + normal → block, multiplier 0.5', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 15, regime: 'normal', multiplier: 1.0 });
    vi.useFakeTimers({ now: new Date(2026, 6, 15) }); // Jul
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(false);
    expect(result.vixMultiplier).toBe(0.5);
    expect(result.seasonalRiskOff).toBe(true);
    expect(result.season).toBe('summer');
  });

  it('summer + elevated → block, multiplier 0.0', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 25, regime: 'elevated', multiplier: 0.5 });
    vi.useFakeTimers({ now: new Date(2026, 4, 1) }); // May
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(false);
    expect(result.vixMultiplier).toBe(0.0);
    expect(result.seasonalRiskOff).toBe(true);
    expect(result.season).toBe('summer');
  });

  it('summer + crisis → block, multiplier 0.0', async () => {
    mockGetVixRegime.mockResolvedValueOnce({ vixClose: 45, regime: 'crisis', multiplier: 0.0 });
    vi.useFakeTimers({ now: new Date(2026, 9, 20) }); // Oct
    const result = await getCombinedRiskGate();
    vi.useRealTimers();

    expect(result.allowNewEntries).toBe(false);
    expect(result.vixMultiplier).toBe(0.0);
    expect(result.seasonalRiskOff).toBe(true);
    expect(result.season).toBe('summer');
  });
});
