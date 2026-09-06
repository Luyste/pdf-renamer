import { Hono } from 'hono';
import type { Env } from '../env';
import { metaKey, processedKey, stagingKey } from '../lib/keys';
import { clearUndoLog, readUndoLog } from '../lib/undo';

export const undo = new Hono<{ Bindings: Env }>();

undo.post('/api/undo', async (c) => {
  const { batchId } = await c.req.json<{ batchId: string }>();
  const entries = await readUndoLog(c.env.BUCKET, batchId);

  let restored = 0;
  for (const entry of entries) {
    const deleted = await c.env.BUCKET.head(metaKey(batchId, entry.fileId));
    if (!deleted) continue;

    const src = await c.env.BUCKET.head(stagingKey(batchId, entry.fileId));
    const sha256 = src?.customMetadata?.sha256;
    if (sha256) {
      const record = await c.env.BUCKET.get(processedKey(sha256));
      if (record) {
        const data = await record.json<{ batchId: string }>();
        if (data.batchId === batchId)
          await c.env.BUCKET.delete(processedKey(sha256));
      }
    }

    await c.env.BUCKET.delete(metaKey(batchId, entry.fileId));
    restored += 1;
  }

  await clearUndoLog(c.env.BUCKET, batchId);

  return c.json({ restored });
});
