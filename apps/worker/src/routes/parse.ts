import type { ParseResult } from '@org/shared-types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppBindings } from '../env';
import { parsedKey, stagingPrefix } from '../lib/keys';
import { ocrParse } from '../lib/ocr-client';

export const parse = new Hono<AppBindings>();

// The OCR container is CPU-bound (Tesseract subprocess per page) and runs as
// a single small instance, so extra parallelism adds no throughput — it only
// splits the CPU further and pushes slow scans past Tesseract's 60s timeout
// in extract.py. Two keeps the pipe full without starving each request.
const PARSE_CONCURRENCY = 2;

/** Stand-in result for a file the OCR service never managed to parse, so the
 * UI can move it out of "parsing" and show why instead of spinning forever. */
function failedResult(
  fileId: string,
  originalName: string,
  message: string,
): ParseResult & { fileId: string } {
  const empty = { value: null, raw: '', ok: false, note: message };
  return {
    fileId,
    source: originalName,
    invoice: empty,
    fulfil_date: empty,
    customer: empty,
    filename: null,
    problems: [message],
    confident: false,
    ocr_dump: {},
  };
}

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
        let originalName = `${fileId}.pdf`;

        try {
          const obj = await c.env.BUCKET.get(object.key);
          if (!obj) throw new Error('staging object not found');

          originalName = obj.customMetadata?.originalName ?? originalName;
          const body = await obj.arrayBuffer();
          const res = await ocrParse(c.env, originalName, body, requestId);
          if (!res.ok) {
            throw new Error(`ocr-service returned ${res.status}`);
          }
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

          await stream.writeSSE({
            data: JSON.stringify({ ...result, fileId }),
          });
        } catch (err) {
          // One file failing must not take the whole stream (and every other
          // file's result) down with it. Report it and keep going. Nothing is
          // written to parsed/, so a page reload retries this file.
          const message = err instanceof Error ? err.message : String(err);
          logger.error('parse.file_failed', { batchId, fileId, message });
          await stream.writeSSE({
            data: JSON.stringify(failedResult(fileId, originalName, message)),
          });
        }
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
