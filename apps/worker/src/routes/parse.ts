import type { ParseResult } from '@org/shared-types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Env } from '../env';
import { stagingPrefix } from '../lib/keys';
import { ocrParse } from '../lib/ocr-client';

export const parse = new Hono<{ Bindings: Env }>();

parse.get('/api/parse', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const fileIdsParam = c.req.query('fileIds');
  const fileIdFilter = fileIdsParam ? new Set(fileIdsParam.split(',')) : null;

  const listed = await c.env.BUCKET.list({ prefix: stagingPrefix(batchId) });

  return streamSSE(c, async (stream) => {
    for (const object of listed.objects) {
      const fileId = object.key
        .slice(stagingPrefix(batchId).length)
        .replace(/\.pdf$/, '');
      if (fileIdFilter && !fileIdFilter.has(fileId)) continue;
      const obj = await c.env.BUCKET.get(object.key);
      if (!obj) continue;

      const originalName = obj.customMetadata?.originalName ?? `${fileId}.pdf`;
      const body = await obj.arrayBuffer();
      const res = await ocrParse(c.env, originalName, body);
      const result = await res.json<ParseResult>();

      await stream.writeSSE({ data: JSON.stringify({ ...result, fileId }) });
    }
    await stream.writeSSE({ data: JSON.stringify({ done: true }) });
  });
});
