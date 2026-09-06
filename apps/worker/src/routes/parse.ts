import type { ParseResult } from '@org/shared-types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Env } from '../env';
import { stagingPrefix } from '../lib/keys';
import { ocrParse } from '../lib/ocr-client';

export const parse = new Hono<{ Bindings: Env }>();

// The OCR container is CPU-bound (Tesseract subprocess per page), so this
// caps how many requests are in flight at once rather than firing all of
// them at the container simultaneously.
const PARSE_CONCURRENCY = 4;

parse.get('/api/parse', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const fileIdsParam = c.req.query('fileIds');
  const fileIdFilter = fileIdsParam ? new Set(fileIdsParam.split(',')) : null;

  const listed = await c.env.BUCKET.list({ prefix: stagingPrefix(batchId) });
  const objects = listed.objects.filter((object) => {
    if (!fileIdFilter) return true;
    const fileId = object.key
      .slice(stagingPrefix(batchId).length)
      .replace(/\.pdf$/, '');
    return fileIdFilter.has(fileId);
  });

  return streamSSE(c, async (stream) => {
    let next = 0;
    const worker = async () => {
      while (next < objects.length) {
        const object = objects[next++];
        const fileId = object.key
          .slice(stagingPrefix(batchId).length)
          .replace(/\.pdf$/, '');
        const obj = await c.env.BUCKET.get(object.key);
        if (!obj) continue;

        const originalName =
          obj.customMetadata?.originalName ?? `${fileId}.pdf`;
        const body = await obj.arrayBuffer();
        const res = await ocrParse(c.env, originalName, body);
        const result = await res.json<ParseResult>();

        await stream.writeSSE({ data: JSON.stringify({ ...result, fileId }) });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PARSE_CONCURRENCY, objects.length) }, () =>
        worker(),
      ),
    );
    await stream.writeSSE({ data: JSON.stringify({ done: true }) });
  });
});
