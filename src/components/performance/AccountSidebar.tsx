'use client';

import { cn } from '@/lib/utils';

interface AccountData {
  balance: number;
  tradeRisk: number;
  riskValue: number;
  currency: string;
}

interface AccountSidebarProps {
  account: AccountData;
}

function formatGBP(value: number): string {
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountSidebar({ account }: AccountSidebarProps) {
  return (
    <div className="card-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Account Balance</span>
        <span className="text-lg font-bold font-mono text-profit">{formatGBP(account.balance)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Trade Risk</span>
        <span className="text-sm font-mono text-foreground">{formatGBP(account.tradeRisk)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Risk Value</span>
        <span className={cn('text-sm font-mono', account.riskValue > 10 ? 'text-loss' : 'text-foreground')}>
          {account.riskValue.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
