/**
 * Fix Planet Labs ticker: rename DMYQ → PL after SPAC merger.
 * DMYQ (dMY Technology Group IV) merged into Planet Labs (NYSE: PL).
 * The old DMYQ ticker no longer resolves for market data.
 * Run with: npx tsx scripts/fix-pl-ticker.ts
 */
import prisma from '../src/lib/prisma';

async function main() {
  const dmyqStock = await prisma.stock.findUnique({ where: { ticker: 'DMYQ' } });
  const plStock = await prisma.stock.findUnique({ where: { ticker: 'PL' } });

  console.log('DMYQ stock:', dmyqStock ? { id: dmyqStock.id, ticker: dmyqStock.ticker, name: dmyqStock.name, t212Ticker: dmyqStock.t212Ticker } : 'NOT FOUND');
  console.log('PL stock:', plStock ? { id: plStock.id, ticker: plStock.ticker, name: plStock.name } : 'NOT FOUND');

  if (!dmyqStock) {
    console.log('No DMYQ stock found — nothing to fix.');
    return;
  }

  const positions = await prisma.position.findMany({ where: { stockId: dmyqStock.id } });
  console.log(`Found ${positions.length} position(s) on DMYQ stock`);

  if (plStock) {
    // PL stock already exists — re-link positions to it
    if (positions.length > 0) {
      const result = await prisma.position.updateMany({
        where: { stockId: dmyqStock.id },
        data: { stockId: plStock.id, t212Ticker: 'PL_US_EQ' },
      });
      console.log(`Re-linked ${result.count} position(s) from DMYQ → PL`);
    }

    // Ensure PL stock has correct t212Ticker and yahooTicker
    await prisma.stock.update({
      where: { id: plStock.id },
      data: {
        t212Ticker: plStock.t212Ticker || 'PL_US_EQ',
        yahooTicker: plStock.yahooTicker || 'PL',
        name: plStock.name === 'PL' ? 'Planet Labs' : plStock.name,
      },
    });
    console.log('Updated PL stock with t212Ticker, yahooTicker, name');

    // Delete the orphaned DMYQ stock if nothing references it
    const remaining = await prisma.position.count({ where: { stockId: dmyqStock.id } });
    const scans = await prisma.scanResult.count({ where: { stockId: dmyqStock.id } });
    if (remaining === 0 && scans === 0) {
      await prisma.stock.delete({ where: { id: dmyqStock.id } });
      console.log('Deleted orphaned DMYQ stock record');
    } else {
      console.log(`Kept DMYQ stock — still has ${remaining} position(s), ${scans} scan result(s)`);
    }
  } else {
    // No PL stock exists — just rename DMYQ to PL
    // NOTE: T212 API still uses DMYQ_US_EQ internally even though their UI shows "PL - NYSE"
    await prisma.stock.update({
      where: { id: dmyqStock.id },
      data: {
        ticker: 'PL',
        yahooTicker: 'PL',
        t212Ticker: 'DMYQ_US_EQ',   // T212 API uses old SPAC ticker
        name: 'Planet Labs',
      },
    });
    console.log('Renamed DMYQ → PL with yahooTicker = PL, t212Ticker = DMYQ_US_EQ');

    // Ensure positions keep the T212-compatible ticker
    if (positions.length > 0) {
      const result = await prisma.position.updateMany({
        where: { stockId: dmyqStock.id },
        data: { t212Ticker: 'DMYQ_US_EQ' },
      });
      console.log(`Set t212Ticker = DMYQ_US_EQ on ${result.count} position(s)`);
    }
  }

  console.log('\nDone. Verify with: SELECT ticker, name, t212Ticker, yahooTicker FROM Stock WHERE ticker = \'PL\';');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
