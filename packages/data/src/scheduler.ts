import cron from 'node-cron';
import { env } from '../../config/src/env';
import { refreshUniverseDailyBars } from './service';
import { createLogger } from '../../../src/lib/logger';

const log = createLogger('DataScheduler');

export function registerNightlyIngestionJob() {
  return cron.schedule(env.MARKET_DATA_NIGHTLY_CRON, async () => {
    try {
      await refreshUniverseDailyBars({ force: true });
    } catch (error) {
      log.error('Nightly market-data refresh failed.', { error: (error as Error).message });
    }
  });
}