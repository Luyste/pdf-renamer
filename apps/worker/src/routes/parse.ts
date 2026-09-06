import type { ParseResult } from '@org/shared-types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppBindings } from '../env';
import { parsedKey, stagingPrefix } from '../lib/keys';
import { ocrParse } from '../lib/ocr-client';

export const parse = new Hono<AppBindings>();

// The OCR container is CPU-bound (Tesseract subprocess per page), so this
// caps how many requests are in flight at once rather than firing all of
// them at the container simultaneously.
const PARSE_CONCURRENCY = 4;

parse.get('/api/parse', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const requestId = c.get('requestId');
  const logger = c.get('logger');
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

  logger.info('parse.batch_start', { batchId, count: objects.length });

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
        const res = await ocrParse(c.env, originalName, body, requestId);
        const result = await res.json<ParseResult>();

        if (result.problems.length > 0) {
          logger.warn('parse.file_had_problems', {
            batchId,
            fileId,
            problems: result.problems,
          });
        }

        await c.env.BUCKET.put(
          parsedKey(batchId, fileId),
          JSON.stringify(result),
          { httpMetadata: { contentType: 'application/json' } },
        );

        await stream.writeSSE({ data: JSON.stringify({ ...result, fileId }) });
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PARSE_CONCURRENCY, objects.length) }, () =>
        worker(),
      ),
    );
    logger.info('parse.batch_done', { batchId, count: objects.length });
    await stream.writeSSE({ data: JSON.stringify({ done: true }) });
  });
});
