import { Hono } from 'hono';
import type { Env } from '../env';
import { stagingKey } from '../lib/keys';

export const upload = new Hono<{ Bindings: Env }>();

upload.post('/api/upload', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const form = await c.req.parseBody({ all: true });
  const files = ([] as File[]).concat((form.files ?? []) as File | File[]);
  if (files.length === 0) return c.json({ error: 'no files provided' }, 400);

  const results: { fileId: string; originalName: string }[] = [];
  for (const file of files) {
    const fileId = crypto.randomUUID();
    await c.env.BUCKET.put(
      stagingKey(batchId, fileId),
      await file.arrayBuffer(),
      {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { originalName: file.name },
      },
    );
    results.push({ fileId, originalName: file.name });
  }

  return c.json(results);
});
