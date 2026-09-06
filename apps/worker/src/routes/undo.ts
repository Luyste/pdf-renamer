import { Hono } from 'hono';
import type { Env } from '../env';
import { metaKey } from '../lib/keys';
import { clearUndoLog, readUndoLog } from '../lib/undo';

export const undo = new Hono<{ Bindings: Env }>();

undo.post('/api/undo', async (c) => {
  const { batchId } = await c.req.json<{ batchId: string }>();
  const entries = await readUndoLog(c.env.BUCKET, batchId);

  let restored = 0;
  for (const entry of entries) {
    const existed = await c.env.BUCKET.head(metaKey(batchId, entry.fileId));
    if (!existed) continue;
    await c.env.BUCKET.delete(metaKey(batchId, entry.fileId));
    restored += 1;
  }

  await clearUndoLog(c.env.BUCKET, batchId);

  return c.json({ restored });
});
