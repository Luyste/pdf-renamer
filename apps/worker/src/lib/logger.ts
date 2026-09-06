type LogFields = Record<string, unknown>;

export type Logger = {
  info: (msg: string, fields?: LogFields) => void;
  warn: (msg: string, fields?: LogFields) => void;
  error: (msg: string, fields?: LogFields) => void;
};

function write(
  level: 'info' | 'warn' | 'error',
  msg: string,
  fields?: LogFields,
) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * pino-style structured JSON logger, scoped to one request's correlation id.
 *
 * Real pino doesn't run cleanly on workerd (its fast-path transports need
 * Node's fs/worker_threads, which aren't available even with
 * nodejs_compat) — but the shape that matters, one leveled JSON object per
 * line, is trivial to reproduce with console.log. Cloudflare's Workers Logs
 * captures that output directly and indexes the JSON fields for filtering,
 * so searching by requestId works with zero extra setup.
 */
export function createLogger(requestId: string, extra?: LogFields): Logger {
  const base = { requestId, source: 'worker', ...extra };
  return {
    info: (msg, fields) => write('info', msg, { ...base, ...fields }),
    warn: (msg, fields) => write('warn', msg, { ...base, ...fields }),
    error: (msg, fields) => write('error', msg, { ...base, ...fields }),
  };
}
