import type {
  BatchState,
  FileEntry,
  FileStatus,
  ParseResult,
  ProcessedRecord,
} from '@org/shared-types';
import { Hono } from 'hono';
import type { AppBindings } from '../env';
import {
  metaKey,
  metaPrefix,
  parsedKey,
  parsedPrefix,
  processedKey,
  stagingKey,
  stagingPrefix,
  undoLogKey,
} from '../lib/keys';

export const batch = new Hono<AppBindings>();

type FileMeta = {
  status: 'done' | 'review';
  filename: string;
  originalName: string;
};

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  const listed = await bucket.list({ prefix });
  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects.map((o) => o.key));
  }
}

batch.get('/api/batch/:batchId', async (c) => {
  const batchId = c.req.param('batchId');
  const staging = await c.env.BUCKET.list({ prefix: stagingPrefix(batchId) });

  const entries: FileEntry[] = await Promise.all(
    staging.objects.map(async (object): Promise<FileEntry> => {
      const fileId = object.key
        .slice(stagingPrefix(batchId).length)
        .replace(/\.pdf$/, '');
      const head = await c.env.BUCKET.head(object.key);
      const originalName =
        head?.customMetadata?.originalName ?? `${fileId}.pdf`;

      const [parsedObj, metaObj, processedObj] = await Promise.all([
        c.env.BUCKET.get(parsedKey(batchId, fileId)),
        c.env.BUCKET.get(metaKey(batchId, fileId)),
        head?.customMetadata?.sha256
          ? c.env.BUCKET.get(processedKey(head.customMetadata.sha256))
          : Promise.resolve(null),
      ]);

      const result = parsedObj ? await parsedObj.json<ParseResult>() : null;
      const meta = metaObj ? await metaObj.json<FileMeta>() : null;
      const alreadyProcessed = processedObj
        ? await processedObj.json<ProcessedRecord>()
        : null;

      let status: FileStatus;
      if (meta?.status === 'done') status = 'confirmed';
      else if (meta?.status === 'review') status = 'skipped';
      else if (result) status = 'parsed';
      else status = 'parsing';

      return {
        fileId,
        originalName,
        status,
        result,
        filename: meta?.filename ?? result?.filename ?? '',
        alreadyProcessed,
      };
    }),
  );

  const body: BatchState = { batchId, entries };
  return c.json(body);
});

batch.delete('/api/batch/:batchId/files/:fileId', async (c) => {
  const { batchId, fileId } = c.req.param();
  await c.env.BUCKET.delete(stagingKey(batchId, fileId));
  await c.env.BUCKET.delete(parsedKey(batchId, fileId));
  await c.env.BUCKET.delete(metaKey(batchId, fileId));
  c.get('logger').info('batch.file_deleted', { batchId, fileId });
  return c.json({ deleted: true });
});

// Deliberately does NOT touch processed/ — that's a cross-batch record kept
// around (independent of any one batch's lifecycle) purely to flag
// already-processed duplicate uploads later.
batch.delete('/api/batch/:batchId', async (c) => {
  const batchId = c.req.param('batchId');
  await deletePrefix(c.env.BUCKET, stagingPrefix(batchId));
  await deletePrefix(c.env.BUCKET, parsedPrefix(batchId));
  await deletePrefix(c.env.BUCKET, metaPrefix(batchId));
  await c.env.BUCKET.delete(undoLogKey(batchId));
  c.get('logger').info('batch.deleted', { batchId });
  return c.json({ deleted: true });
});
