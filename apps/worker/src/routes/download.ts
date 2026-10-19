import type { ConfirmItem, ProcessedRecord } from '@org/shared-types';
import { downloadZip } from 'client-zip';
import { Hono } from 'hono';
import type { AppBindings } from '../env';
import { nextAvailableName, processedKey, stagingKey } from '../lib/keys';

export const download = new Hono<AppBindings>();

/** Zips the confirmed PDFs straight out of staging/ under the filenames the
 * browser sends. Nothing about the confirm step is persisted, so retrying
 * with the same items always yields the same ZIP. */
download.post('/api/download', async (c) => {
  const { batchId, items } = await c.req.json<{
    batchId: string;
    items: ConfirmItem[];
  }>();
  if (!batchId || !Array.isArray(items)) {
    return c.json({ error: 'batchId and items required' }, 400);
  }

  const usedNames = new Set<string>();
  const files = items
    .filter((item) => !item.skip && item.filename)
    .map((item) => {
      const name = nextAvailableName(usedNames, item.filename as string);
      usedNames.add(name);
      return { fileId: item.token, originalName: item.original, name };
    });

  const bucket = c.env.BUCKET;
  const logger = c.get('logger');

  // Lazy on purpose: client-zip pulls the next entry only after it has
  // streamed the previous one, so at most one R2 body is open at a time.
  // Opening every body up front left the later ones sitting idle for the
  // whole download, and one dropped body aborts the entire ZIP mid-stream.
  const entries = async function* () {
    let fileCount = 0;
    for (const file of files) {
      const pdf = await bucket.get(stagingKey(batchId, file.fileId));
      if (!pdf) {
        logger.warn('download.file_missing', { batchId, fileId: file.fileId });
        continue;
      }
      yield { name: file.name, lastModified: pdf.uploaded, input: pdf.body };
      fileCount += 1;

      // Resumes only once that body has been fully zipped — only now does
      // the file count as "processed" for cross-batch dedupe.
      if (pdf.customMetadata?.sha256) {
        const record: ProcessedRecord = {
          originalName: file.originalName,
          filename: file.name,
          batchId,
          downloadedAt: new Date().toISOString(),
        };
        await bucket.put(
          processedKey(pdf.customMetadata.sha256),
          JSON.stringify(record),
          { httpMetadata: { contentType: 'application/json' } },
        );
      }
    }
    logger.info('download.zip_built', {
      batchId,
      fileCount,
      skipped: items.length - files.length,
    });
  };

  const zipResponse = downloadZip(entries());
  return new Response(zipResponse.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="invoices-${batchId}.zip"`,
    },
  });
});
