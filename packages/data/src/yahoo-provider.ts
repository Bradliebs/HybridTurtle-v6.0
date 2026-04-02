import YahooFinance from 'yahoo-finance2';
import { normalizeYahooBar } from './normalizers';
import type { MarketDataProvider } from './provider';
import type { HistoricalBarsResult, HistoricalInterval, HistoricalRange } from './types';

const yahooFinance = new YahooFinance();

function resolvePeriod1(range: HistoricalRange): Date {
  const now = new Date();

  switch (range) {
    case '1mo':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, now.getUTCDate()));
    case '3mo':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate()));
    case '6mo':
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()));
    case '1y':
      return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
    case '2y':
      return new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate()));
    case '5y':
      return new Date(Date.UTC(now.getUTCFullYear() - 5, now.getUTCMonth(), now.getUTCDate()));
    case '10y':
      return new Date(Date.UTC(now.getUTCFullYear() - 10, now.getUTCMonth(), now.getUTCDate()));
    case 'ytd':
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    case 'max':
      return new Date('1970-01-01T00:00:00.000Z');
  }
}

export class YahooMarketDataProvider implements MarketDataProvider {
  async fetchHistoricalBars(symbol: string, range: HistoricalRange, interval: HistoricalInterval): Promise<HistoricalBarsResult> {
    const fetchedAt = new Date();
    const response = await yahooFinance.chart(symbol, {
      period1: resolvePeriod1(range),
      interval,
      events: 'div|split',
      includePrePost: false,
      return: 'array',
    });

    const bars = response.quotes
      .map((quote) => normalizeYahooBar(quote, fetchedAt))
      .filter((bar): bar is NonNullable<typeof bar> => bar !== null);

    return {
      symbol,
      bars,
      fetchedAt,
      meta: response.meta as Record<string, unknown>,
      events: (response.events as Record<string, unknown> | undefined) ?? null,
    };
  }
}