import { Hono } from 'hono';
import type { Env } from '../env';
import { donePrefix, stagingPrefix } from '../lib/keys';

export const batch = new Hono<{ Bindings: Env }>();

async function deletePrefix(bucket: R2Bucket, prefix: string) {
  const listed = await bucket.list({ prefix });
  if (listed.objects.length > 0) {
    await bucket.delete(listed.objects.map((o) => o.key));
  }
}

batch.delete('/api/batch/:batchId', async (c) => {
  const batchId = c.req.param('batchId');
  await deletePrefix(c.env.BUCKET, stagingPrefix(batchId));
  await deletePrefix(c.env.BUCKET, donePrefix(batchId));
  return c.json({ deleted: true });
});
