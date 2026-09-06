import type { ConfirmItem, ProcessedRecord } from '@org/shared-types';
import { Hono } from 'hono';
import type { Env } from '../env';
import {
  metaKey,
  metaPrefix,
  nextAvailableName,
  processedKey,
  stagingKey,
} from '../lib/keys';
import { appendUndoLog, type UndoEntry } from '../lib/undo';

export const confirm = new Hono<{ Bindings: Env }>();

type FileMeta = {
  status: 'done' | 'review';
  filename: string;
  originalName: string;
};

confirm.post('/api/confirm', async (c) => {
  const body = await c.req.json<{ batchId: string; items: ConfirmItem[] }>();
  const { batchId, items } = body;

  // Filenames already claimed by earlier confirms in this batch, so a
  // repeat confirm call doesn't produce two "done" entries with the same name.
  const existingMeta = await c.env.BUCKET.list({ prefix: metaPrefix(batchId) });
  const usedNames = new Set<string>();
  for (const object of existingMeta.objects) {
    const obj = await c.env.BUCKET.get(object.key);
    if (!obj) continue;
    const meta = await obj.json<FileMeta>();
    if (meta.status === 'done') usedNames.add(meta.filename);
  }

  const undoEntries: UndoEntry[] = [];
  const results: {
    fileId: string;
    ok: boolean;
    filename?: string;
    error?: string;
  }[] = [];

  for (const item of items) {
    const srcKey = stagingKey(batchId, item.token);
    const src = await c.env.BUCKET.head(srcKey);
    if (!src) {
      results.push({
        fileId: item.token,
        ok: false,
        error: 'source object not found',
      });
      continue;
    }

    const isDone = !item.skip && !!item.filename;
    const filename = isDone
      ? nextAvailableName(usedNames, item.filename as string)
      : item.original;
    if (isDone) usedNames.add(filename);

    const meta: FileMeta = {
      status: isDone ? 'done' : 'review',
      filename,
      originalName: item.original,
    };
    await c.env.BUCKET.put(metaKey(batchId, item.token), JSON.stringify(meta), {
      httpMetadata: { contentType: 'application/json' },
    });

    if (isDone && src.customMetadata?.sha256) {
      const record: ProcessedRecord = {
        originalName: item.original,
        filename,
        batchId,
        confirmedAt: new Date().toISOString(),
      };
      await c.env.BUCKET.put(
        processedKey(src.customMetadata.sha256),
        JSON.stringify(record),
        { httpMetadata: { contentType: 'application/json' } },
      );
    }

    undoEntries.push({ fileId: item.token });
    results.push({ fileId: item.token, ok: true, filename });
  }

  await appendUndoLog(c.env.BUCKET, batchId, undoEntries);

  return c.json({ results });
});
