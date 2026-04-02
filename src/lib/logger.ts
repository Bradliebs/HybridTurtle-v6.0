/**
 * Structured logger — thin wrapper over console.
 *
 * Provides:
 * - Named child loggers with `[prefix]` context
 * - Log levels (debug, info, warn, error) controllable via LOG_LEVEL env var
 * - Consistent formatting for production log parsing
 * - Drop-in replacement: `const log = createLogger('RiskGates')` then `log.info('...')`
 *
 * Can be swapped for pino/winston later by changing this single file.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getConfiguredLevel(): number {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LOG_LEVELS[envLevel] ?? LOG_LEVELS.info;
}

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  child: (prefix: string) => Logger;
}

function formatMessage(prefix: string, message: string, data?: Record<string, unknown>): string {
  const base = `[${prefix}] ${message}`;
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export function createLogger(prefix: string): Logger {
  const level = getConfiguredLevel();

  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (level <= LOG_LEVELS.debug) {
        console.debug(formatMessage(prefix, message, data));
      }
    },
    info(message: string, data?: Record<string, unknown>) {
      if (level <= LOG_LEVELS.info) {
        console.log(formatMessage(prefix, message, data));
      }
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (level <= LOG_LEVELS.warn) {
        console.warn(formatMessage(prefix, message, data));
      }
    },
    error(message: string, data?: Record<string, unknown>) {
      if (level <= LOG_LEVELS.error) {
        console.error(formatMessage(prefix, message, data));
      }
    },
    child(childPrefix: string): Logger {
      return createLogger(`${prefix}:${childPrefix}`);
    },
  };
}
