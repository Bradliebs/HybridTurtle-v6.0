'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

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

interface TradeListPanelProps {
  openTrades: TradeRow[];
  closedTrades: TradeRow[];
}

function formatR(r: number): string {
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}`;
}

function formatPnl(v: number): string {
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}£${abs.toFixed(2)}`;
}

function formatDate(d: string): string {
  const date = new Date(d);
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options);
}

function AccountBadge({ type }: { type: string | null }) {
  if (!type || type === 'invest') return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
      ISA
    </span>
  );
}

export default function TradeListPanel({ openTrades, closedTrades }: TradeListPanelProps) {
  const [tab, setTab] = useState<'open' | 'closed'>('closed');
  const trades = tab === 'open' ? openTrades : closedTrades;

  return (
    <div className="card-surface p-4 flex flex-col">
      {/* Tab Headers */}
      <div className="flex border-b border-border mb-3">
        <button
          onClick={() => setTab('open')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'open'
              ? 'text-primary-400 border-primary-400'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          OPEN
        </button>
        <button
          onClick={() => setTab('closed')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            tab === 'closed'
              ? 'text-primary-400 border-primary-400'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          )}
        >
          CLOSED
        </button>
      </div>

      {/* Trade List */}
      <div className="overflow-y-auto max-h-[480px] space-y-1">
        {trades.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No {tab} trades.
          </div>
        )}
        {trades.map((trade) => {
          const isWin = (trade.rMultiple ?? 0) > 0.1;
          const isLoss = (trade.rMultiple ?? 0) < -0.1;
          return (
            <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-navy-600/30 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{trade.ticker}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-profit/15 text-profit border border-profit/30">
                    LONG
                  </span>
                  <AccountBadge type={trade.accountType} />
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  <span className="capitalize">{trade.entryType.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(trade.entryDate)}
                  {trade.exitDate && ` — ${formatDate(trade.exitDate)}`}
                </div>
              </div>

              <div className="text-right flex-shrink-0 ml-3">
                {trade.rMultiple != null && (
                  <div className={cn('text-sm font-bold font-mono', isWin ? 'text-profit' : isLoss ? 'text-loss' : 'text-foreground')}>
                    {formatR(trade.rMultiple)} <span className="text-xs font-normal text-muted-foreground">R:R</span>
                  </div>
                )}
                {trade.pctGain != null && (
                  <div className={cn('text-xs font-mono', trade.pctGain >= 0 ? 'text-profit' : 'text-loss')}>
                    {trade.pctGain >= 0 ? '+' : ''}{trade.pctGain.toFixed(2)} %
                  </div>
                )}
                {trade.pnlGbp != null && (
                  <div className={cn('text-xs font-mono', trade.pnlGbp >= 0 ? 'text-profit' : 'text-loss')}>
                    {formatPnl(trade.pnlGbp)}
                  </div>
                )}
                {tab === 'open' && trade.daysHeld != null && (
                  <div className="text-xs text-muted-foreground">
                    {trade.daysHeld}d held
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
