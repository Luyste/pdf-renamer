import type { ConfirmItem } from '@org/shared-types';
import { Hono } from 'hono';
import type { Env } from '../env';
import {
  doneKey,
  nextAvailableKey,
  reviewPrefix,
  stagingKey,
} from '../lib/keys';
import { appendUndoLog, type UndoEntry } from '../lib/undo';

export const confirm = new Hono<{ Bindings: Env }>();

confirm.post('/api/confirm', async (c) => {
  const body = await c.req.json<{ batchId: string; items: ConfirmItem[] }>();
  const { batchId, items } = body;

  const undoEntries: UndoEntry[] = [];
  const results: {
    fileId: string;
    ok: boolean;
    key?: string;
    error?: string;
  }[] = [];

  for (const item of items) {
    const srcKey = stagingKey(batchId, item.token);
    const obj = await c.env.BUCKET.get(srcKey);
    if (!obj) {
      results.push({
        fileId: item.token,
        ok: false,
        error: 'source object not found',
      });
      continue;
    }

    const destKey =
      item.skip || !item.filename
        ? await nextAvailableKey(
            c.env.BUCKET,
            reviewPrefix(batchId),
            item.original,
          )
        : doneKey(batchId, item.filename);

    await c.env.BUCKET.put(destKey, await obj.arrayBuffer(), {
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    });

    undoEntries.push({
      fileId: item.token,
      from: srcKey,
      to: destKey,
      originalName: item.original,
    });
    results.push({ fileId: item.token, ok: true, key: destKey });
  }

  await appendUndoLog(c.env.BUCKET, batchId, undoEntries);

  return c.json({ results });
});
