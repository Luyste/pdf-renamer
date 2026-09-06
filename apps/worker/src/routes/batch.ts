import { Hono } from 'hono';
import type { Env } from '../env';
import { metaPrefix, stagingPrefix, undoLogKey } from '../lib/keys';

export const batch = new Hono<{ Bindings: Env }>();

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  const listed = await bucket.list({ prefix });
  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects.map((o) => o.key));
  }
}

// Deliberately does NOT touch processed/ — that's a cross-batch record kept
// around (independent of any one batch's lifecycle) purely to flag
// already-processed duplicate uploads later.
batch.delete('/api/batch/:batchId', async (c) => {
  const batchId = c.req.param('batchId');
  await deletePrefix(c.env.BUCKET, stagingPrefix(batchId));
  await deletePrefix(c.env.BUCKET, metaPrefix(batchId));
  await c.env.BUCKET.delete(undoLogKey(batchId));
  return c.json({ deleted: true });
});
