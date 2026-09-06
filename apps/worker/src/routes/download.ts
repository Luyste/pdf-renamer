import type { ProcessedRecord } from '@org/shared-types';
import { downloadZip } from 'client-zip';
import { Hono } from 'hono';
import type { Env } from '../env';
import { metaPrefix, processedKey, stagingKey } from '../lib/keys';

export const download = new Hono<{ Bindings: Env }>();

type FileMeta = {
  status: 'done' | 'review';
  filename: string;
  originalName: string;
};
type ZipInput = { name: string; lastModified: Date; input: ReadableStream };

download.get('/api/download', async (c) => {
  const batchId = c.req.query('batchId');
  if (!batchId) return c.json({ error: 'batchId query param required' }, 400);

  const prefix = metaPrefix(batchId);
  const listed = await c.env.BUCKET.list({ prefix });

  const resolved = await Promise.all(
    listed.objects.map(async (object): Promise<ZipInput | null> => {
      const metaObj = await c.env.BUCKET.get(object.key);
      if (!metaObj) return null;
      const meta = await metaObj.json<FileMeta>();
      if (meta.status !== 'done') return null;

      const fileId = object.key.slice(prefix.length).replace(/\.json$/, '');
      const pdf = await c.env.BUCKET.get(stagingKey(batchId, fileId));
      if (!pdf?.body) return null;

      // Only now — actually zipped and about to be handed to the user —
      // does this file count as "processed" for cross-batch dedupe.
      if (pdf.customMetadata?.sha256) {
        const record: ProcessedRecord = {
          originalName: meta.originalName,
          filename: meta.filename,
          batchId,
          downloadedAt: new Date().toISOString(),
        };
        await c.env.BUCKET.put(
          processedKey(pdf.customMetadata.sha256),
          JSON.stringify(record),
          { httpMetadata: { contentType: 'application/json' } },
        );
      }

      return {
        name: meta.filename,
        lastModified: object.uploaded,
        input: pdf.body,
      };
    }),
  );
  const inputs = resolved.filter((entry): entry is ZipInput => entry !== null);

  const zipResponse = downloadZip(inputs);
  return new Response(zipResponse.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="invoices-${batchId}.zip"`,
    },
  });
});
