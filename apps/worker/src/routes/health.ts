import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { ocrHealth } from '../lib/ocr-client';

export const health = new Hono<AppBindings>();

health.get('/api/health', async (c) => {
  const res = await ocrHealth(c.env, c.get('requestId'));
  const data = await res.json();
  return c.json(data);
});
