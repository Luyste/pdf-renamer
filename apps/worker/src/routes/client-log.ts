import { Hono } from 'hono';
import type { AppBindings } from '../env';

export const clientLog = new Hono<AppBindings>();

/** Lets the browser funnel its own errors/warnings into the same log
 * stream as the worker and container, tagged with the same requestId, so
 * one search in Workers Logs shows the full web -> worker -> container
 * trace for a single failure. */
clientLog.post('/api/client-log', async (c) => {
  const body = await c.req.json<{
    level?: 'info' | 'warn' | 'error';
    msg: string;
    context?: Record<string, unknown>;
  }>();
  const logger = c.get('logger');
  const level =
    body.level === 'error' || body.level === 'warn' ? body.level : 'info';
  logger[level](body.msg, { source: 'web', ...body.context });
  return c.json({ ok: true });
});
