/**
 * DEPENDENCIES
 * Consumed by: settings/page.tsx
 * Consumes: /api/stops/auto (GET + PUT + POST)
 * Risk-sensitive: YES — controls automatic stop execution
 * Last modified: 2026-04-01
 * Notes: Toggle for auto-stop autopilot + manual trigger button.
 *        When enabled, the hourly scheduler auto-ratchets stops up (never down).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/lib/api-client';
import { ShieldCheck, Loader2, Play, Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutoStopStatus {
  autoStopsEnabled: boolean;
}

interface AutoCycleResult {
  enabled: boolean;
  positionsChecked: number;
  stopsUpdated: number;
  t212Pushed: number;
  t212Failed: number;
  skipped: number;
  errors: string[];
  message?: string;
}

export default function AutoStopsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<AutoCycleResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await apiRequest<AutoStopStatus>('/api/stops/auto');
        setEnabled(data.autoStopsEnabled);
      } catch {
        // defaults to off
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const handleToggle = useCallback(async () => {
    setToggling(true);
    setShowConfirm(false);
    try {
      const data = await apiRequest<AutoStopStatus & { message: string }>('/api/stops/auto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoStopsEnabled: !enabled }),
      });
      setEnabled(data.autoStopsEnabled);
    } catch {
      // error handled by apiRequest
    } finally {
      setToggling(false);
    }
  }, [enabled]);

  const handleRunNow = useCallback(async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const data = await apiRequest<AutoCycleResult>('/api/stops/auto', { method: 'POST' });
      setLastResult(data);
    } catch {
      // error handled by apiRequest
    } finally {
      setRunning(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="card-surface p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading auto-stop settings...
      </div>
    );
  }

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border/30 flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400" />
        <div>
          <h2 className="font-semibold text-foreground">Auto-Stop Autopilot</h2>
          <p className="text-xs text-muted-foreground">Automatically ratchet stops up every hour — stops never decrease</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">Enable auto-stop ratchet</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              When enabled, the system checks every hour for stop upgrades (R-based ladder + trailing ATR).
              Stops are pushed to Trading 212 and recorded in the database automatically.
              Stops can only move up — monotonic enforcement is always active.
            </div>
            {enabled && (
              <div className="text-[10px] text-amber-400 mt-1">
                ⚠ Autopilot active — stops will be updated automatically every hour during market days.
                Requires the auto-stop scheduler to be running (<code className="text-amber-300">npm run stops:auto</code>).
              </div>
            )}
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={toggling}
            title={enabled ? 'Disable auto-stop autopilot' : 'Enable auto-stop autopilot'}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
              enabled ? 'bg-emerald-600' : 'bg-navy-700',
              toggling && 'opacity-50'
            )}
          >
            <span className={cn(
              'inline-block h-4 w-4 rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1'
            )} />
          </button>
        </div>

        {/* Confirmation banner */}
        {showConfirm && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-950/40 p-4">
            <p className="text-sm font-medium text-amber-300">
              {enabled ? 'Disable auto-stop autopilot?' : 'Enable auto-stop autopilot?'}
            </p>
            <p className="mt-1 text-xs text-amber-400/70">
              {enabled
                ? 'Stops will no longer be ratcheted automatically. You must manage stops manually.'
                : 'Stops will be automatically ratcheted up every hour during market hours. Stops can only move up — never down.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleToggle}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded bg-navy-700 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-navy-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Run Now button */}
        {enabled && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunNow}
              disabled={running}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {running ? 'Running cycle...' : 'Run Now'}
            </button>
            <span className="text-xs text-muted-foreground">Trigger a manual auto-stop check</span>
          </div>
        )}

        {/* Last result */}
        {lastResult && (
          <div className={cn(
            'rounded-lg p-4 text-sm space-y-1',
            lastResult.errors.length > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'
          )}>
            {!lastResult.enabled ? (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                {lastResult.message || 'Auto-stop autopilot is disabled.'}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4" />
                  Cycle complete
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Positions checked: {lastResult.positionsChecked}</div>
                  <div>Stops updated: {lastResult.stopsUpdated}</div>
                  <div>T212 pushed: {lastResult.t212Pushed}</div>
                  {lastResult.t212Failed > 0 && <div className="text-red-400">T212 failed: {lastResult.t212Failed}</div>}
                  {lastResult.skipped > 0 && <div>Skipped (already current): {lastResult.skipped}</div>}
                  {lastResult.errors.length > 0 && (
                    <div className="text-red-400 mt-1">
                      Errors: {lastResult.errors.join('; ')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
