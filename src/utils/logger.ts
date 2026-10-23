interface GlobalProcess {
  env?: {
    LOG_LEVEL?: string;
  };
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevelNum =
  LOG_LEVELS[
    ((typeof process !== 'undefined'
      ? (process as GlobalProcess).env?.LOG_LEVEL?.toLowerCase()
      : undefined) as LogLevel) || 'info'
  ] ?? LOG_LEVELS.info;

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  return err;
}

function createLogger(bindings: Record<string, unknown> = {}) {
  const log = (level: LogLevel, metaOrMsg: Record<string, unknown> | string, msg?: string) => {
    if (LOG_LEVELS[level] < currentLevelNum) return;

    const isMsgFirst = typeof metaOrMsg === 'string';
    const rawMeta = isMsgFirst ? {} : { ...metaOrMsg };
    const message = isMsgFirst ? metaOrMsg : msg;

    if ('err' in rawMeta) {
      rawMeta.err = serializeError(rawMeta.err);
    }

    const payload = {
      level,
      time: Date.now(),
      ...(message ? { msg: message } : {}),
      ...bindings,
      ...rawMeta,
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('debug', metaOrMsg, msg),
    info: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('info', metaOrMsg, msg),
    warn: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('warn', metaOrMsg, msg),
    error: (metaOrMsg: Record<string, unknown> | string, msg?: string) =>
      log('error', metaOrMsg, msg),
    child: (childBindings: Record<string, unknown>) =>
      createLogger({ ...bindings, ...childBindings }),
  };
}

/**
 * Lightweight JSON logger with level filtering and error serialization.
 *
 * @example
 * logger.info({ command: 'ping' }, 'dispatched command');
 * logger.error({ err }, 'failed to process message');
 */
export const logger = createLogger();
