'use client';

/**
 * DEPENDENCIES
 * Consumed by: navigation (Performance nav group)
 * Consumes: /api/performance/analytics, src/components/performance/*, src/components/shared/Navbar.tsx
 * Risk-sensitive: NO — display only
 * Last modified: 2026-04-04
 * Notes: TradeZella-style full performance analytics page with period cards,
 *        equity curve, R:R bar chart, trade list, and monthly stats table.
 */

import { useEffect, useState, useCallback } from 'react';
import Navbar from '@/components/shared/Navbar';
import PeriodSummaryCard from '@/components/performance/PeriodSummaryCard';
import AccountSidebar from '@/components/performance/AccountSidebar';
import EquityCurveChart from '@/components/performance/EquityCurveChart';
import RMultipleBarChart from '@/components/performance/RMultipleBarChart';
import TradeListPanel from '@/components/performance/TradeListPanel';
import MonthlyStatsTable from '@/components/performance/MonthlyStatsTable';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Loader2, AlertTriangle } from 'lucide-react';

// ── Types (mirroring API response) ──────────────────────────

interface PeriodStats {
  totalR: number;
  totalPctGain: number;
  totalPnlGbp: number;
  winRate: number;
  tradeCount: number;
  wins: number;
  losses: number;
  breakeven: number;
}

interface TradeRow {
  id: string;
  ticker: string;
  entryType: string;
  entryDate: string;
  exitDate: string | null;
  rMultiple: number | null;
  pctGain: number | null;
  pnlGbp: number | null;
  daysHeld: number | null;
  accountType: string | null;
}

interface AnalyticsData {
  ok: boolean;
  account: { balance: number; tradeRisk: number; riskValue: number; currency: string };
  periods: {
    thisWeek: PeriodStats;
    thisMonth: PeriodStats;
    thisYear: PeriodStats;
    allTime: PeriodStats;
  };
  equityCurve: { date: string; value: number }[];
  rMultipleByMonth: { month: string; avgR: number; totalR: number; tradeCount: number }[];
  openTrades: TradeRow[];
  closedTrades: TradeRow[];
  monthlyStats: { year: number; month: number; totalR: number; totalPnl: number; winRate: number; tradeCount: number }[];
}

type AccountFilter = 'all' | 'invest' | 'isa';

// ── Page Component ──────────────────────────────────────────

export default function PerformancePage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  const fetchData = useCallback(async (filter: AccountFilter) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<AnalyticsData>(
        `/api/performance/analytics${filter !== 'all' ? `?accountType=${filter}` : ''}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(accountFilter);
  }, [fetchData, accountFilter]);

  const accountTabs: { key: AccountFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'invest', label: 'Invest' },
    { key: 'isa', label: 'ISA' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Account Filter Tabs */}
        <div className="flex items-center gap-2">
          {accountTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAccountFilter(tab.key)}
              className={cn(
                'px-4 py-1.5 text-sm font-medium rounded-lg transition-colors',
                accountFilter === tab.key
                  ? 'bg-primary/20 text-primary-400 border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground border border-border hover:bg-navy-600/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 gap-3">
            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading performance analytics…</span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="card-surface p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-foreground font-medium">Could not load performance data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <button
              onClick={() => fetchData(accountFilter)}
              className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold bg-primary/15 text-primary-400 border border-primary/30 hover:bg-primary/25 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Data loaded */}
        {!loading && !error && data && (
          <>
            {/* Period Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <PeriodSummaryCard label="This Week" stats={data.periods.thisWeek} currency={data.account.currency} />
              <PeriodSummaryCard label="This Month" stats={data.periods.thisMonth} currency={data.account.currency} />
              <PeriodSummaryCard label="This Year" stats={data.periods.thisYear} currency={data.account.currency} />
              <PeriodSummaryCard label="All Time" stats={data.periods.allTime} currency={data.account.currency} />
            </div>

            {/* Charts + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Charts (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                <EquityCurveChart data={data.equityCurve} />
                <RMultipleBarChart data={data.rMultipleByMonth} />
              </div>

              {/* Right: Account + Trade List (1 col) */}
              <div className="space-y-6">
                <AccountSidebar account={data.account} />
                <TradeListPanel openTrades={data.openTrades} closedTrades={data.closedTrades} />
              </div>
            </div>

            {/* Monthly Stats Table */}
            <MonthlyStatsTable data={data.monthlyStats} currency={data.account.currency} />
          </>
        )}
      </main>
    </div>
  );
}
