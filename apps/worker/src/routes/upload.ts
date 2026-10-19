import {
  MAX_BATCH_SIZE,
  type ProcessedRecord,
  type UploadedFile,
} from '@org/shared-types';
import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { processedKey, stagingKey, stagingPrefix } from '../lib/keys';

export const upload = new Hono<AppBindings>();

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

upload.post('/api/upload', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  // One file per request — the browser uploads them one at a time so it can
  // show progress, and the worker never holds more than one PDF in memory.
  const { file } = await c.req.parseBody();
  if (!(file instanceof File)) {
    return c.json({ error: 'file form field required' }, 400);
  }

  const existing = await c.env.BUCKET.list({ prefix: stagingPrefix(batchId) });
  if (existing.objects.length >= MAX_BATCH_SIZE) {
    c.get('logger').warn('upload.batch_limit_rejected', {
      batchId,
      existing: existing.objects.length,
    });
    return c.json({ error: `batch limit is ${MAX_BATCH_SIZE} files` }, 400);
  }

  const fileId = crypto.randomUUID();
  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);

  await c.env.BUCKET.put(stagingKey(batchId, fileId), bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { originalName: file.name, sha256 },
  });

  const prior = await c.env.BUCKET.get(processedKey(sha256));
  const alreadyProcessed = prior ? await prior.json<ProcessedRecord>() : null;

  c.get('logger').info('upload.completed', {
    batchId,
    fileId,
    duplicate: !!alreadyProcessed,
  });

  const result: UploadedFile = {
    fileId,
    originalName: file.name,
    alreadyProcessed,
  };
  return c.json(result);
});
