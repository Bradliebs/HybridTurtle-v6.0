/**
 * Diagnostic: List all T212 positions to find Planet Labs instrument ticker.
 * Run with: npx tsx scripts/check-t212-pl.ts
 */
import { Trading212Client } from '../src/lib/trading212';
import { getCredentialsForAccount } from '../src/lib/trading212-dual';
import prisma from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found');
    return;
  }

  for (const acctType of ['invest', 'isa'] as const) {
    try {
      const creds = getCredentialsForAccount(user, acctType);
      if (!creds) {
        console.log(`\n=== ${acctType.toUpperCase()} account: not connected ===`);
        continue;
      }
      const client = new Trading212Client(creds.apiKey, creds.apiSecret, creds.environment);
      console.log(`\n=== ${acctType.toUpperCase()} account positions ===`);
      const positions = await client.getPositions();
      for (const pos of positions) {
        console.log(`  ${pos.instrument.ticker} — ${pos.instrument.name} (qty: ${pos.quantity}, price: ${pos.currentPrice})`);
      }
      if (positions.length === 0) console.log('  (no positions)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not connected') || msg.includes('API key')) {
        console.log(`\n=== ${acctType.toUpperCase()} account: not connected ===`);
      } else {
        console.log(`\n=== ${acctType.toUpperCase()} account error: ${msg} ===`);
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
