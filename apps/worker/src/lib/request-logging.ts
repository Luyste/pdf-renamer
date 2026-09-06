import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env';
import { createLogger } from './logger';

/** Reads (or mints) a correlation id for this request, exposes it via
 * c.get('requestId')/c.get('logger'), echoes it back as a response header
 * so the browser can show/report it, and logs one line per request with
 * method/path/status/duration. */
export const requestLogging: MiddlewareHandler<AppBindings> = async (
  c,
  next,
) => {
  const requestId =
    c.req.header('x-request-id') ??
    c.req.query('requestId') ??
    crypto.randomUUID();
  const logger = createLogger(requestId);
  c.set('requestId', requestId);
  c.set('logger', logger);
  c.header('X-Request-Id', requestId);

  const start = Date.now();
  logger.info('request.start', { method: c.req.method, path: c.req.path });

  await next();

  logger.info('request.end', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  });
};
