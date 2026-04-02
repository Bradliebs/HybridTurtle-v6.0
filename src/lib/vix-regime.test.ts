import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyVix } from './vix-regime';

// ── classifyVix (pure function — no mocks needed) ──

describe('classifyVix', () => {
  it('returns normal / 1.0 when VIX < 20', () => {
    const result = classifyVix(15.5);
    expect(result).toEqual({ vixClose: 15.5, regime: 'normal', multiplier: 1.0 });
  });

  it('returns normal / 1.0 at VIX = 0 (edge)', () => {
    const result = classifyVix(0);
    expect(result).toEqual({ vixClose: 0, regime: 'normal', multiplier: 1.0 });
  });

  it('returns normal / 1.0 at VIX = 19.99', () => {
    const result = classifyVix(19.99);
    expect(result).toEqual({ vixClose: 19.99, regime: 'normal', multiplier: 1.0 });
  });

  it('returns elevated / 0.5 at VIX = 20 (boundary)', () => {
    const result = classifyVix(20);
    expect(result).toEqual({ vixClose: 20, regime: 'elevated', multiplier: 0.5 });
  });

  it('returns elevated / 0.5 at VIX = 25', () => {
    const result = classifyVix(25);
    expect(result).toEqual({ vixClose: 25, regime: 'elevated', multiplier: 0.5 });
  });

  it('returns elevated / 0.5 at VIX = 30 (boundary)', () => {
    const result = classifyVix(30);
    expect(result).toEqual({ vixClose: 30, regime: 'elevated', multiplier: 0.5 });
  });

  it('returns crisis / 0.0 at VIX = 30.01', () => {
    const result = classifyVix(30.01);
    expect(result).toEqual({ vixClose: 30.01, regime: 'crisis', multiplier: 0.0 });
  });

  it('returns crisis / 0.0 at VIX = 50', () => {
    const result = classifyVix(50);
    expect(result).toEqual({ vixClose: 50, regime: 'crisis', multiplier: 0.0 });
  });

  it('returns crisis / 0.0 at VIX = 80 (extreme)', () => {
    const result = classifyVix(80);
    expect(result).toEqual({ vixClose: 80, regime: 'crisis', multiplier: 0.0 });
  });
});

// ── getVixRegime (integration — Yahoo + Prisma mocked) ──

// Mock yahoo-finance2
vi.mock('yahoo-finance2', () => {
  const mockQuote = vi.fn();
  return {
    default: class {
      quote = mockQuote;
    },
    __mockQuote: mockQuote,
  };
});

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      await fn({
        vixSnapshot: { create: vi.fn().mockResolvedValue({}) },
      });
    }),
  },
}));

describe('getVixRegime', () => {
  let getVixRegime: () => Promise<{ vixClose: number; regime: string; multiplier: number }>;
  let mockQuote: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic import after mocks are in place
    const mod = await import('./vix-regime');
    getVixRegime = mod.getVixRegime;
    const yfMod = await import('yahoo-finance2');
    mockQuote = (yfMod as unknown as { __mockQuote: ReturnType<typeof vi.fn> }).__mockQuote;
  });

  it('returns normal regime for VIX = 15', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 15 });
    const result = await getVixRegime();
    expect(result.regime).toBe('normal');
    expect(result.multiplier).toBe(1.0);
    expect(result.vixClose).toBe(15);
  });

  it('returns elevated regime for VIX = 25', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 25 });
    const result = await getVixRegime();
    expect(result.regime).toBe('elevated');
    expect(result.multiplier).toBe(0.5);
  });

  it('returns crisis regime for VIX = 40', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 40 });
    const result = await getVixRegime();
    expect(result.regime).toBe('crisis');
    expect(result.multiplier).toBe(0.0);
  });

  it('returns safe default when Yahoo fetch throws', async () => {
    mockQuote.mockRejectedValueOnce(new Error('Network error'));
    const result = await getVixRegime();
    expect(result.regime).toBe('elevated');
    expect(result.multiplier).toBe(0.5);
    expect(result.vixClose).toBe(0);
  });

  it('returns safe default when quote returns null', async () => {
    mockQuote.mockResolvedValueOnce(null);
    const result = await getVixRegime();
    expect(result.regime).toBe('elevated');
    expect(result.multiplier).toBe(0.5);
  });

  it('returns safe default when price is 0', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: 0 });
    const result = await getVixRegime();
    expect(result.regime).toBe('elevated');
    expect(result.multiplier).toBe(0.5);
  });

  it('returns safe default when price is negative', async () => {
    mockQuote.mockResolvedValueOnce({ regularMarketPrice: -5 });
    const result = await getVixRegime();
    expect(result.regime).toBe('elevated');
    expect(result.multiplier).toBe(0.5);
  });
});
