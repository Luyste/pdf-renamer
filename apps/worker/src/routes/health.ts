import { Hono } from 'hono';
import type { Env } from '../env';
import { ocrHealth } from '../lib/ocr-client';

export const health = new Hono<{ Bindings: Env }>();

health.get('/api/health', async (c) => {
  const res = await ocrHealth(c.env);
  const data = await res.json();
  return c.json(data);
});
