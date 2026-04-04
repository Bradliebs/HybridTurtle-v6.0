'use client';

import { PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';

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

interface PeriodSummaryCardProps {
  label: string;
  stats: PeriodStats;
  currency?: string;
}

function MiniWinRateDonut({ winRate }: { winRate: number }) {
  const data = [
    { value: winRate, color: '#22c55e' },
    { value: 100 - winRate, color: '#1e293b' },
  ];
  return (
    <div className="relative w-14 h-14 flex-shrink-0">
      <PieChart width={56} height={56}>
        <Pie
          data={data}
          cx={28}
          cy={28}
          innerRadius={18}
          outerRadius={26}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-foreground">{winRate.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function OutcomeBubbles({ wins, losses, breakeven }: { wins: number; losses: number; breakeven: number }) {
  const maxBubbles = 10;
  const total = wins + losses + breakeven;
  if (total === 0) return null;

  // Show actual counts as numbered circles
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {wins > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-profit/15 border border-profit/30">
          <div className="w-2 h-2 rounded-full bg-profit" />
          <span className="text-[10px] font-bold text-profit">{wins}</span>
        </div>
      )}
      {losses > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-loss/15 border border-loss/30">
          <div className="w-2 h-2 rounded-full bg-loss" />
          <span className="text-[10px] font-bold text-loss">{losses}</span>
        </div>
      )}
      {breakeven > 0 && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[10px] font-bold text-amber-400">{breakeven}</span>
        </div>
      )}
    </div>
  );
}

function formatR(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatPnl(value: number, currency: string): string {
  const abs = Math.abs(value);
  const prefix = value < 0 ? '-' : '';
  return `${prefix}£${abs.toFixed(2)}`;
}

export default function PeriodSummaryCard({ label, stats, currency = 'GBP' }: PeriodSummaryCardProps) {
  const rPositive = stats.totalR >= 0;

  return (
    <div className="card-surface p-4 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</h3>

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          {/* R:R value */}
          <div className={cn('text-2xl font-bold font-mono', rPositive ? 'text-profit' : 'text-loss')}>
            {formatR(stats.totalR)} <span className="text-sm font-normal text-muted-foreground">R:R</span>
          </div>

          {/* Percent + PnL */}
          <div className="flex items-center gap-2 text-sm">
            <span className={cn('font-mono', stats.totalPctGain >= 0 ? 'text-profit' : 'text-loss')}>
              {stats.totalPctGain >= 0 ? '+' : ''}{stats.totalPctGain.toFixed(2)} %
            </span>
          </div>
          <div className={cn('text-sm font-mono', stats.totalPnlGbp >= 0 ? 'text-profit' : 'text-loss')}>
            {formatPnl(stats.totalPnlGbp, currency)}
          </div>
        </div>

        {/* Win rate donut */}
        {stats.tradeCount > 0 && <MiniWinRateDonut winRate={stats.winRate} />}
      </div>

      {/* Outcome bubbles */}
      <OutcomeBubbles wins={stats.wins} losses={stats.losses} breakeven={stats.breakeven} />
    </div>
  );
}
