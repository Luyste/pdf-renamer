import { Hono } from 'hono';
import type { Env } from '../env';
import { clearUndoLog, readUndoLog } from '../lib/undo';

export const undo = new Hono<{ Bindings: Env }>();

undo.post('/api/undo', async (c) => {
  const { batchId } = await c.req.json<{ batchId: string }>();
  const entries = await readUndoLog(c.env.BUCKET, batchId);

  let restored = 0;
  for (const entry of entries) {
    const obj = await c.env.BUCKET.get(entry.to);
    if (!obj) continue;
    await c.env.BUCKET.put(entry.from, await obj.arrayBuffer(), {
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
    });
    await c.env.BUCKET.delete(entry.to);
    restored += 1;
  }

  await clearUndoLog(c.env.BUCKET, batchId);

  return c.json({ restored });
});
