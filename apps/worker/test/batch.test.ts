import { describe, expect, test } from 'bun:test';
import type { BatchState } from '@org/shared-types';
import { makeEnv, parseResult, pdfBytes, request } from './helpers';

async function seedBatch() {
  const { bucket, env } = makeEnv();
  await bucket.put('staging/b1/parsed-file.pdf', pdfBytes('1'), {
    customMetadata: { originalName: 'first.pdf', sha256: 'aaa' },
  });
  await bucket.put('staging/b1/pending-file.pdf', pdfBytes('2'), {
    customMetadata: { originalName: 'second.pdf', sha256: 'bbb' },
  });
  await bucket.put(
    'parsed/b1/parsed-file.json',
    JSON.stringify(parseResult({ filename: 'renamed.pdf' })),
  );
  await bucket.put(
    'processed/aaa.json',
    JSON.stringify({
      originalName: 'first.pdf',
      filename: 'renamed.pdf',
      batchId: 'b0',
      downloadedAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  await bucket.put('staging/other/keep.pdf', pdfBytes('3'));
  await bucket.put('parsed/other/keep.json', JSON.stringify(parseResult()));
  return { bucket, env };
}

describe('GET /api/batch/:batchId', () => {
  test('rebuilds every file from storage, parsed or still parsing', async () => {
    const { env } = await seedBatch();

    const res = await request(env, '/api/batch/b1');
    const body: BatchState = await res.json();

    expect(body.batchId).toBe('b1');
    const byId = Object.fromEntries(body.entries.map((e) => [e.fileId, e]));
    expect(Object.keys(byId).sort()).toEqual(['parsed-file', 'pending-file']);

    expect(byId['parsed-file']).toMatchObject({
      originalName: 'first.pdf',
      status: 'parsed',
      filename: 'renamed.pdf',
      alreadyProcessed: { batchId: 'b0' },
    });
    expect(byId['parsed-file'].result?.filename).toBe('renamed.pdf');

    expect(byId['pending-file']).toMatchObject({
      originalName: 'second.pdf',
      status: 'parsing',
      result: null,
      filename: '',
      alreadyProcessed: null,
    });
  });

  test('returns an empty batch for an unknown id', async () => {
    const { env } = makeEnv();

    const body: BatchState = await (
      await request(env, '/api/batch/nope')
    ).json();

    expect(body).toEqual({ batchId: 'nope', entries: [] });
  });
});

describe('DELETE /api/batch/:batchId/files/:fileId', () => {
  test('removes that one file and its parse result', async () => {
    const { bucket, env } = await seedBatch();

    const res = await request(env, '/api/batch/b1/files/parsed-file', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(bucket.objects.has('staging/b1/parsed-file.pdf')).toBe(false);
    expect(bucket.objects.has('parsed/b1/parsed-file.json')).toBe(false);
    expect(bucket.objects.has('staging/b1/pending-file.pdf')).toBe(true);
  });
});

describe('DELETE /api/batch/:batchId', () => {
  test('removes the batch but keeps other batches and the processed history', async () => {
    const { bucket, env } = await seedBatch();

    const res = await request(env, '/api/batch/b1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect([...bucket.objects.keys()].sort()).toEqual([
      'parsed/other/keep.json',
      'processed/aaa.json',
      'staging/other/keep.pdf',
    ]);
  });
});
