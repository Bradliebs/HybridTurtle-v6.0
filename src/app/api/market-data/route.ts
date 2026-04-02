import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getStockQuote,
  getBatchQuotes,
  getMarketIndices,
  getFearGreedIndex,
  getMarketRegime,
  getBatchPrices,
  getDailyPrices,
} from '@/lib/market-data';
import type { StockQuote } from '@/types';
import { apiError } from '@/lib/api-response';
import { parseQueryParams } from '@/lib/request-validation';

export const dynamic = 'force-dynamic';

const ALLOWED_ACTIONS = ['quote', 'quotes', 'prices', 'indices', 'fear-greed', 'regime', 'historical'] as const;

const marketDataQuerySchema = z.object({
  action: z.enum(ALLOWED_ACTIONS).optional().default('quote'),
  ticker: z.string().min(1).max(20).optional(),
  tickers: z.string().min(1).max(500).optional(),
});

// GET /api/market-data?action=quote&ticker=AAPL
// GET /api/market-data?action=quotes&tickers=AAPL,MSFT,NVDA
// GET /api/market-data?action=indices
// GET /api/market-data?action=fear-greed
// GET /api/market-data?action=regime
// GET /api/market-data?action=prices&tickers=AAPL,MSFT
export async function GET(request: NextRequest) {
  const qv = parseQueryParams(request, marketDataQuerySchema);
  if (!qv.ok) return qv.response;

  const { action, ticker, tickers: tickersParam } = qv.data;

  try {

    switch (action) {
      case 'quote': {
        if (!ticker) {
          return apiError(400, 'INVALID_REQUEST', 'ticker parameter required');
        }
        const quote = await getStockQuote(ticker);
        if (!quote) {
          return apiError(404, 'QUOTE_NOT_FOUND', `No data for ${ticker}`);
        }
        return NextResponse.json(quote);
      }

      case 'quotes': {
        if (!tickersParam) {
          return apiError(400, 'INVALID_REQUEST', 'tickers parameter required (comma-separated)');
        }
        const tickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean);
        const quotes = await getBatchQuotes(tickers);
        // Convert Map to object for JSON
        const obj: Record<string, StockQuote> = {};
        quotes.forEach((v, k) => { obj[k] = v; });
        return NextResponse.json({ quotes: obj, count: quotes.size });
      }

      case 'prices': {
        if (!tickersParam) {
          return apiError(400, 'INVALID_REQUEST', 'tickers parameter required');
        }
        const tickers = tickersParam.split(',').map((t) => t.trim()).filter(Boolean);
        const prices = await getBatchPrices(tickers);
        return NextResponse.json({ prices });
      }

      case 'indices': {
        const indices = await getMarketIndices();
        return NextResponse.json({ indices });
      }

      case 'fear-greed': {
        const fg = await getFearGreedIndex();
        return NextResponse.json(fg);
      }

      case 'regime': {
        const regime = await getMarketRegime();
        return NextResponse.json({ regime });
      }

      case 'historical': {
        if (!ticker) {
          return apiError(400, 'INVALID_REQUEST', 'ticker parameter required');
        }
        const bars = await getDailyPrices(ticker, 'full');
        return NextResponse.json({ ticker, bars, count: bars.length });
      }

      default:
        return apiError(400, 'UNKNOWN_ACTION', `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Market data API error:', error);
    return apiError(500, 'MARKET_DATA_FAILED', 'Failed to fetch market data', (error as Error).message, true);
  }
}
