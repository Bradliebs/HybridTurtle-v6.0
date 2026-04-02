export interface SyncedEntryTradeLogInput {
  userId: string;
  positionId: string;
  ticker: string;
  entryDate: Date;
  entryPrice: number;
  shares: number;
  stopLoss: number;
  initialRisk: number;
  atrAtEntry?: number | null;
  accountType: 'invest' | 'isa';
  isin?: string | null;
}

export function buildSyncedEntryTradeLogData(input: SyncedEntryTradeLogInput) {
  const accountLabel = input.accountType.toUpperCase();
  const isinSuffix = input.isin ? `. ISIN: ${input.isin}` : '';

  return {
    userId: input.userId,
    positionId: input.positionId,
    ticker: input.ticker,
    tradeDate: input.entryDate,
    tradeType: 'ENTRY' as const,
    decision: 'TAKEN',
    decisionReason: `Synced from Trading 212 (${accountLabel})${isinSuffix}`,
    entryPrice: input.entryPrice,
    initialStop: input.stopLoss,
    initialR: input.initialRisk,
    shares: input.shares,
    atrAtEntry: input.atrAtEntry ?? null,
    plannedEntry: null,
    actualFill: input.entryPrice,
    slippagePct: null,
    fillTime: input.entryDate,
  };
}