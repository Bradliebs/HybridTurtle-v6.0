import prisma from '../src/lib/prisma';
import { runIntradayAlert } from '../src/cron/intraday-alert';

async function main() {
  const result = await runIntradayAlert();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Intraday alert failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
