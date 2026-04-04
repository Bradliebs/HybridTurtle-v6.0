'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MonthlyStatRow {
  year: number;
  month: number;
  totalR: number;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
}

interface MonthlyStatsTableProps {
  data: MonthlyStatRow[];
  currency?: string;
}

type ViewMode = 'rr' | 'pnl' | 'winrate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function MonthlyStatsTable({ data, currency = 'GBP' }: MonthlyStatsTableProps) {
  const [view, setView] = useState<ViewMode>('rr');

  // Group by year
  const yearData = useMemo(() => {
    const years = new Map<number, Map<number, MonthlyStatRow>>();
    for (const row of data) {
      if (!years.has(row.year)) years.set(row.year, new Map());
      years.get(row.year)!.set(row.month, row);
    }

    return Array.from(years.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, months]) => {
        // Compute year totals
        let totalR = 0;
        let totalPnl = 0;
        let totalWins = 0;
        let totalTrades = 0;
        for (const m of months.values()) {
          totalR += m.totalR;
          totalPnl += m.totalPnl;
          totalTrades += m.tradeCount;
          totalWins += Math.round((m.winRate / 100) * m.tradeCount);
        }
        const yearTotal = {
          totalR,
          totalPnl,
          winRate: totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0,
          tradeCount: totalTrades,
        };
        return { year, months, yearTotal };
      });
  }, [data]);

  function formatCell(row: MonthlyStatRow | undefined): { primary: string; secondary: string; tertiary: string; isPositive: boolean } | null {
    if (!row) return null;
    return {
      primary: `${row.totalR >= 0 ? '+' : ''}${row.totalR.toFixed(2)} R:R`,
      secondary: `${row.totalPnl < 0 ? '-' : ''}£${Math.abs(row.totalPnl).toFixed(2)}`,
      tertiary: `${row.winRate.toFixed(0)}%`,
      isPositive: row.totalR >= 0,
    };
  }

  function renderCellContent(row: MonthlyStatRow | undefined) {
    if (!row) return <span className="text-muted-foreground/30">—</span>;
    const isPositive = view === 'rr' ? row.totalR >= 0 : view === 'pnl' ? row.totalPnl >= 0 : row.winRate >= 50;

    return (
      <div className="space-y-0.5">
        {view === 'rr' && (
          <>
            <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
              {row.totalR >= 0 ? '+' : ''}{row.totalR.toFixed(2)} R:R
            </div>
            <div className={cn('text-[10px] font-mono', row.totalPnl >= 0 ? 'text-profit' : 'text-loss')}>
              {row.totalPnl < 0 ? '-' : ''}£{Math.abs(row.totalPnl).toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">{row.winRate.toFixed(0)}%</div>
          </>
        )}
        {view === 'pnl' && (
          <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
            {row.totalPnl < 0 ? '-' : ''}£{Math.abs(row.totalPnl).toFixed(2)}
          </div>
        )}
        {view === 'winrate' && (
          <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
            {row.winRate.toFixed(1)}%
          </div>
        )}
      </div>
    );
  }

  function renderTotalContent(totals: { totalR: number; totalPnl: number; winRate: number; tradeCount: number }) {
    const isPositive = view === 'rr' ? totals.totalR >= 0 : view === 'pnl' ? totals.totalPnl >= 0 : totals.winRate >= 50;

    return (
      <div className="space-y-0.5">
        {view === 'rr' && (
          <>
            <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
              {totals.totalR >= 0 ? '+' : ''}{totals.totalR.toFixed(2)} R:R
            </div>
            <div className={cn('text-[10px] font-mono', totals.totalPnl >= 0 ? 'text-profit' : 'text-loss')}>
              {totals.totalPnl < 0 ? '-' : ''}£{Math.abs(totals.totalPnl).toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">{totals.winRate.toFixed(0)}%</div>
          </>
        )}
        {view === 'pnl' && (
          <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
            {totals.totalPnl < 0 ? '-' : ''}£{Math.abs(totals.totalPnl).toFixed(2)}
          </div>
        )}
        {view === 'winrate' && (
          <div className={cn('text-xs font-bold font-mono', isPositive ? 'text-profit' : 'text-loss')}>
            {totals.winRate.toFixed(1)}%
          </div>
        )}
      </div>
    );
  }

  if (yearData.length === 0) {
    return (
      <div className="card-surface p-4 text-center text-sm text-muted-foreground py-8">
        No monthly statistics yet. Close some trades to build your track record.
      </div>
    );
  }

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Monthly Stats</h3>
        <div className="flex items-center gap-1">
          {([
            { key: 'rr', label: 'R:R' },
            { key: 'pnl', label: 'PROFIT' },
            { key: 'winrate', label: 'STRIKE RATE' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn(
                'px-2.5 py-1 text-xs rounded font-medium transition-colors',
                view === key
                  ? 'bg-primary/20 text-primary-400 border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-navy-600/50'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-muted-foreground font-semibold">Year</th>
              {MONTHS.map((m) => (
                <th key={m} className="text-center py-2 px-1 text-muted-foreground font-semibold">{m}</th>
              ))}
              <th className="text-center py-2 px-2 text-muted-foreground font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {yearData.map(({ year, months, yearTotal }) => (
              <tr key={year} className="border-b border-border/30 hover:bg-navy-600/20">
                <td className="py-3 px-2 font-bold text-foreground">{year}</td>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <td key={month} className="py-3 px-1 text-center">
                    {renderCellContent(months.get(month))}
                  </td>
                ))}
                <td className="py-3 px-2 text-center">
                  {renderTotalContent(yearTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
