/**
 * Fix TotalEnergies ticker: re-link position from FPp stock to TTE stock.
 * T212 uses "FPp_EQ" for TotalEnergies (Paris) — the correct display ticker is "TTE".
 * Run with: npx tsx scripts/fix-tte-ticker.ts
 */
import prisma from '../src/lib/prisma';

async function main() {
  const fppStock = await prisma.stock.findUnique({ where: { ticker: 'FPp' } });
  const tteStock = await prisma.stock.findUnique({ where: { ticker: 'TTE' } });

  console.log('FPp stock:', fppStock ? { id: fppStock.id, ticker: fppStock.ticker, name: fppStock.name } : 'NOT FOUND');
  console.log('TTE stock:', tteStock ? { id: tteStock.id, ticker: tteStock.ticker, name: tteStock.name } : 'NOT FOUND');

  if (!fppStock) {
    console.log('No FPp stock found — nothing to fix.');
    return;
  }

  const positions = await prisma.position.findMany({ where: { stockId: fppStock.id } });
  console.log(`Found ${positions.length} position(s) on FPp stock`);

  if (tteStock) {
    // Re-link positions to the correct TTE stock
    if (positions.length > 0) {
      const result = await prisma.position.updateMany({
        where: { stockId: fppStock.id },
        data: { stockId: tteStock.id },
      });
      console.log(`Re-linked ${result.count} position(s) from FPp → TTE`);
    }

    // Set t212Ticker and yahooTicker on TTE stock
    await prisma.stock.update({
      where: { id: tteStock.id },
      data: {
        t212Ticker: tteStock.t212Ticker || 'FPp_EQ',
        yahooTicker: tteStock.yahooTicker || 'TTE.PA',
        name: tteStock.name === 'TTE' ? 'TotalEnergies' : tteStock.name,
      },
    });
    console.log('Updated TTE stock with t212Ticker, yahooTicker, name');

    // Delete the orphaned FPp stock if nothing references it
    const remaining = await prisma.position.count({ where: { stockId: fppStock.id } });
    const scans = await prisma.scanResult.count({ where: { stockId: fppStock.id } });
    if (remaining === 0 && scans === 0) {
      await prisma.stock.delete({ where: { id: fppStock.id } });
      console.log('Deleted orphaned FPp stock record');
    } else {
      console.log(`Kept FPp stock — still has ${remaining} position(s), ${scans} scan result(s)`);
    }
  } else {
    // No TTE stock exists — just rename FPp to TTE
    await prisma.stock.update({
      where: { id: fppStock.id },
      data: {
        ticker: 'TTE',
        yahooTicker: 'TTE.PA',
        t212Ticker: fppStock.t212Ticker || 'FPp_EQ',
        name: 'TotalEnergies',
      },
    });
    console.log('Renamed FPp → TTE with yahooTicker = TTE.PA');
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
