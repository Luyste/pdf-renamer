import { downloadZip } from 'client-zip';
import { Hono } from 'hono';
import type { Env } from '../env';
import { donePrefix } from '../lib/keys';

export const download = new Hono<{ Bindings: Env }>();

download.get('/api/download', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const listed = await c.env.BUCKET.list({ prefix: donePrefix(batchId) });
  const prefix = donePrefix(batchId);

  const fetched = await Promise.all(
    listed.objects.map(async (object) => ({
      object,
      body: (await c.env.BUCKET.get(object.key))?.body,
    })),
  );
  const inputs: { name: string; lastModified: Date; input: ReadableStream }[] =
    [];
  for (const f of fetched) {
    if (!f.body) continue;
    inputs.push({
      name: f.object.key.slice(prefix.length),
      lastModified: f.object.uploaded,
      input: f.body,
    });
  }

  const zipResponse = downloadZip(inputs);
  return new Response(zipResponse.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="invoices-${batchId}.zip"`,
    },
  });
});
