/**
 * Tests for Phase 8 protective stop workflow.
 *
 * Tests core safety invariants:
 *   - Stops are never lowered
 *   - Missing stops detected and created
 *   - Mismatch detection when broker stop differs from plan
 *   - ACTIVE_STOP_STATUSES consistency
 *   - Tolerance / near-equality check
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtectiveStopSource, ProtectiveStopStatus, StopAlertState } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { ACTIVE_STOP_STATUSES } from './types';

// ─── Mock the repository ────────────────────────────────────────────
const mockGetOpenPositions = vi.fn();
const mockCloseInactive = vi.fn();
const mockGetLatestPlanned = vi.fn();
const mockUpsert = vi.fn();
const mockCreateAuditEvent = vi.fn();

vi.mock('./repository', () => ({
  getOpenPositionsForStopManagement: (...args: unknown[]) => mockGetOpenPositions(...args),
  closeInactiveProtectiveStops: (...args: unknown[]) => mockCloseInactive(...args),
  getLatestPlannedStopForSymbol: (...args: unknown[]) => mockGetLatestPlanned(...args),
  upsertProtectiveStopRecord: (...args: unknown[]) => mockUpsert(...args),
  createStopAuditEvent: (...args: unknown[]) => mockCreateAuditEvent(...args),
}));

vi.mock('../../data/src/prisma', () => ({
  toInputJson: (v: unknown) => v,
}));

import { runProtectiveStopWorkflow } from './service';

// ─── Helpers ────────────────────────────────────────────────────────
function makeStopRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stop-1',
    stopPrice: new Prisma.Decimal(100),
    status: ProtectiveStopStatus.ACTIVE,
    source: ProtectiveStopSource.BROKER,
    alertState: StopAlertState.CLEAR,
    brokerReference: 'ref-1',
    ...overrides,
  };
}

function makePosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos-1',
    symbol: 'AAPL',
    brokerPositionId: 'bp-1',
    isOpen: true,
    protectiveStops: [],
    instrument: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCloseInactive.mockResolvedValue(0);
  mockCreateAuditEvent.mockResolvedValue({});
  mockUpsert.mockResolvedValue({ record: { id: 'new-stop' }, created: true });
});

// ─── ACTIVE_STOP_STATUSES constant ────────────────────────────────
describe('ACTIVE_STOP_STATUSES', () => {
  it('includes all 6 expected statuses', () => {
    expect(ACTIVE_STOP_STATUSES).toEqual([
      'PLANNED', 'SUBMITTED', 'PENDING', 'ACTIVE', 'MISMATCH', 'MISSING',
    ]);
  });

  it('does not include terminal statuses', () => {
    expect(ACTIVE_STOP_STATUSES).not.toContain('CANCELLED');
    expect(ACTIVE_STOP_STATUSES).not.toContain('TRIGGERED');
    expect(ACTIVE_STOP_STATUSES).not.toContain('EXPIRED');
  });
});

// ─── Missing stops ────────────────────────────────────────────────
describe('runProtectiveStopWorkflow - missing stops', () => {
  it('marks position as MISSING when no stop plan and no current stop', async () => {
    mockGetOpenPositions.mockResolvedValue([makePosition()]);
    mockGetLatestPlanned.mockResolvedValue(null);

    const result = await runProtectiveStopWorkflow();

    expect(result.missingStops).toBe(1);
    expect(result.positionsChecked).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ProtectiveStopStatus.MISSING,
        alertState: StopAlertState.CRITICAL,
      }),
    );
  });

  it('counts missingStopsCreated when creating a new missing stop record', async () => {
    mockGetOpenPositions.mockResolvedValue([makePosition()]);
    mockGetLatestPlanned.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({ record: { id: 'new' }, created: true });

    const result = await runProtectiveStopWorkflow();

    expect(result.missingStopsCreated).toBe(1);
    expect(result.createdStops).toBe(1);
  });

  it('counts as update (not created) when stop already exists', async () => {
    mockGetOpenPositions.mockResolvedValue([makePosition()]);
    mockGetLatestPlanned.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({ record: { id: 'existing' }, created: false });

    const result = await runProtectiveStopWorkflow();

    expect(result.missingStopsCreated).toBe(0);
    expect(result.updatedStops).toBe(1);
  });
});

// ─── Mismatch detection ────────────────────────────────────────────
describe('runProtectiveStopWorkflow - mismatch detection', () => {
  it('detects mismatch when broker stop differs from planned stop', async () => {
    const brokerStop = makeStopRecord({
      stopPrice: new Prisma.Decimal(95),
      source: ProtectiveStopSource.BROKER,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [brokerStop] }),
    ]);
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100,
    });

    const result = await runProtectiveStopWorkflow();

    expect(result.mismatchedStops).toBe(1);
    expect(result.verifiedStops).toBe(1);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ProtectiveStopStatus.MISMATCH,
        alertState: StopAlertState.ALERT,
      }),
    );
  });

  it('does NOT detect mismatch when prices are near-equal', async () => {
    // Two prices that differ by less than STOP_TOLERANCE (0.0001)
    const brokerStop = makeStopRecord({
      stopPrice: new Prisma.Decimal(100),
      source: ProtectiveStopSource.BROKER,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [brokerStop] }),
    ]);
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100.005, // within tolerance of 100 -> |0.005| / 100 = 0.00005 < 0.0001
    });

    const result = await runProtectiveStopWorkflow();

    expect(result.mismatchedStops).toBe(0);
    expect(result.activeStops).toBe(1);
  });

  it('does NOT detect mismatch for non-broker source stops', async () => {
    const localStop = makeStopRecord({
      stopPrice: new Prisma.Decimal(95),
      source: ProtectiveStopSource.SOFTWARE_ONLY,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [localStop] }),
    ]);
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100,
    });

    const result = await runProtectiveStopWorkflow();

    // Non-broker source should NOT go through mismatch path
    expect(result.mismatchedStops).toBe(0);
  });
});

// ─── Never-lower-stop invariant ────────────────────────────────────
describe('runProtectiveStopWorkflow - never lower stops', () => {
  it('uses the higher of current stop and planned stop (never lowers)', async () => {
    const existingStop = makeStopRecord({
      stopPrice: new Prisma.Decimal(110),
      source: ProtectiveStopSource.SOFTWARE_ONLY,
      status: ProtectiveStopStatus.ACTIVE,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [existingStop] }),
    ]);
    // Plan wants stop at 100, but current stop is at 110 — must keep 110
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100,
    });

    await runProtectiveStopWorkflow();

    // The upsert should use 110 (the higher value), not 100
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stopPrice: 110,
        status: ProtectiveStopStatus.ACTIVE,
      }),
    );
  });

  it('raises stop when plan is higher than current', async () => {
    const existingStop = makeStopRecord({
      stopPrice: new Prisma.Decimal(90),
      source: ProtectiveStopSource.SOFTWARE_ONLY,
      status: ProtectiveStopStatus.ACTIVE,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [existingStop] }),
    ]);
    // Plan wants stop at 100, current is 90 — should raise to 100
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100,
    });

    await runProtectiveStopWorkflow();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        stopPrice: 100,
      }),
    );
  });
});

// ─── Active stop resolution ────────────────────────────────────────
describe('runProtectiveStopWorkflow - stop resolution', () => {
  it('picks the first stop matching ACTIVE_STOP_STATUSES', async () => {
    const pendingStop = makeStopRecord({
      status: 'PENDING',
      stopPrice: new Prisma.Decimal(95),
      source: ProtectiveStopSource.BROKER,
    });
    const cancelledStop = makeStopRecord({
      id: 'stop-2',
      status: 'CANCELLED',
      stopPrice: new Prisma.Decimal(80),
      source: ProtectiveStopSource.BROKER,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [pendingStop, cancelledStop] }),
    ]);
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 95.001, // near-equal to 95 → within tolerance
    });

    const result = await runProtectiveStopWorkflow();

    // Should resolve PENDING stop, not CANCELLED
    // And since broker stop ≈ plan, it should be ACTIVE (not mismatch)
    expect(result.activeStops).toBe(1);
    expect(result.mismatchedStops).toBe(0);
  });
});

// ─── Closed stops counter ──────────────────────────────────────────
describe('runProtectiveStopWorkflow - closed stops', () => {
  it('reports the number of inactive stops closed', async () => {
    mockGetOpenPositions.mockResolvedValue([]);
    mockCloseInactive.mockResolvedValue(3);

    const result = await runProtectiveStopWorkflow();

    expect(result.closedStops).toBe(3);
    expect(result.positionsChecked).toBe(0);
  });
});

// ─── Audit events ──────────────────────────────────────────────────
describe('runProtectiveStopWorkflow - audit events', () => {
  it('logs PROTECTIVE_STOP_MISSING event for missing stops', async () => {
    mockGetOpenPositions.mockResolvedValue([makePosition()]);
    mockGetLatestPlanned.mockResolvedValue(null);

    await runProtectiveStopWorkflow({ entityType: 'WORKFLOW', entityId: 'wf-1' });

    expect(mockCreateAuditEvent).toHaveBeenCalledWith(
      'PROTECTIVE_STOP_MISSING',
      'WORKFLOW',
      'wf-1',
      expect.objectContaining({ symbol: 'AAPL' }),
    );
  });

  it('does not log audit events when entityType/entityId not provided', async () => {
    mockGetOpenPositions.mockResolvedValue([makePosition()]);
    mockGetLatestPlanned.mockResolvedValue(null);

    await runProtectiveStopWorkflow();

    expect(mockCreateAuditEvent).not.toHaveBeenCalled();
  });

  it('logs PROTECTIVE_STOP_VERIFIED for active stops', async () => {
    const stop = makeStopRecord({
      source: ProtectiveStopSource.SOFTWARE_ONLY,
      status: ProtectiveStopStatus.ACTIVE,
    });
    mockGetOpenPositions.mockResolvedValue([
      makePosition({ protectiveStops: [stop] }),
    ]);
    mockGetLatestPlanned.mockResolvedValue({
      plannedTradeId: 'pt-1',
      stopPrice: 100,
    });

    await runProtectiveStopWorkflow({ entityType: 'WORKFLOW', entityId: 'wf-1' });

    expect(mockCreateAuditEvent).toHaveBeenCalledWith(
      'PROTECTIVE_STOP_VERIFIED',
      'WORKFLOW',
      'wf-1',
      expect.objectContaining({ symbol: 'AAPL' }),
    );
  });
});
