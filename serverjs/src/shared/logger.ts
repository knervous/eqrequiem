export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function shouldLog(current: LogLevel, expected: LogLevel): boolean {
  const order: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };
  return order[current] <= order[expected];
}

export function createLogger(level: LogLevel): Logger {
  function emit(expected: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!shouldLog(level, expected)) {
      return;
    }

    const prefix = `[${new Date().toISOString()}] [${expected.toUpperCase()}]`;
    if (meta && Object.keys(meta).length > 0) {
      console.log(prefix, message, meta);
      return;
    }

    console.log(prefix, message);
  }

  return {
    debug(message, meta) {
      emit('debug', message, meta);
    },
    info(message, meta) {
      emit('info', message, meta);
    },
    warn(message, meta) {
      emit('warn', message, meta);
    },
    error(message, meta) {
      emit('error', message, meta);
    },
  };
}
