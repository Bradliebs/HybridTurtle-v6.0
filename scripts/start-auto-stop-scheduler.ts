import 'dotenv/config';
import cron from 'node-cron';
import { env } from '../packages/config/src/env';

// Dynamic import to resolve @/ path alias at runtime
async function runCycle() {
  const { runAutoStopCycle } = await import('../src/lib/auto-stop-service');
  return runAutoStopCycle('default-user');
}

const task = cron.schedule(env.AUTO_STOPS_CRON, async () => {
  try {
    const result = await runCycle();
    if (!result.enabled) {
      console.log('[auto-stops] Autopilot disabled — skipping cycle.');
      return;
    }
    console.log(
      `[auto-stops] ${result.stopsUpdated} stops updated, ${result.t212Pushed} T212 pushed, ${result.skipped} skipped, ${result.errors.length} errors`
    );
  } catch (error) {
    console.error('[auto-stops] Cycle failed:', (error as Error).message);
  }
});

console.log(`Auto-stop scheduler started (cron: ${env.AUTO_STOPS_CRON}).`);

process.on('SIGINT', () => {
  task.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  task.stop();
  process.exit(0);
});
