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

  const form = await c.req.parseBody({ all: true });
  const files = ([] as File[]).concat((form.files ?? []) as File | File[]);
  if (files.length === 0) return c.json({ error: 'no files provided' }, 400);

  const existing = await c.env.BUCKET.list({ prefix: stagingPrefix(batchId) });
  if (existing.objects.length + files.length > MAX_BATCH_SIZE) {
    c.get('logger').warn('upload.batch_limit_rejected', {
      batchId,
      existing: existing.objects.length,
      attempted: files.length,
    });
    return c.json(
      {
        error: `batch limit is ${MAX_BATCH_SIZE} files (already have ${existing.objects.length}, tried to add ${files.length})`,
      },
      400,
    );
  }

  const results: UploadedFile[] = [];
  for (const file of files) {
    const fileId = crypto.randomUUID();
    const bytes = await file.arrayBuffer();
    const sha256 = await sha256Hex(bytes);

    await c.env.BUCKET.put(stagingKey(batchId, fileId), bytes, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { originalName: file.name, sha256 },
    });

    const prior = await c.env.BUCKET.get(processedKey(sha256));
    const alreadyProcessed = prior ? await prior.json<ProcessedRecord>() : null;

    results.push({ fileId, originalName: file.name, alreadyProcessed });
  }

  c.get('logger').info('upload.completed', {
    batchId,
    count: results.length,
    duplicates: results.filter((r) => r.alreadyProcessed).length,
  });

  return c.json(results);
});
