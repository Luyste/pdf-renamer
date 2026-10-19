import { describe, expect, test } from 'bun:test';
import type { ConfirmItem } from '@org/shared-types';
import { makeEnv, pdfBytes, readZip, request } from './helpers';

async function seed(ids: string[]) {
  const made = makeEnv();
  for (const id of ids) {
    await made.bucket.put(`staging/b1/${id}.pdf`, pdfBytes(id), {
      customMetadata: { originalName: `${id}.pdf`, sha256: `sha-${id}` },
    });
  }
  return made;
}

function item(id: string, filename: string | null, skip = false): ConfirmItem {
  return { token: id, original: `${id}.pdf`, filename, skip };
}

async function download(
  env: ReturnType<typeof makeEnv>['env'],
  items: ConfirmItem[],
) {
  const res = await request(env, '/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId: 'b1', items }),
  });
  return { res, zip: readZip(new Uint8Array(await res.arrayBuffer())) };
}

describe('POST /api/download', () => {
  test('zips the confirmed PDFs under their new names, byte for byte', async () => {
    const { env } = await seed(['f1', 'f2']);

    const { res, zip } = await download(env, [
      item('f1', '2026.03.15-ABC-2026-0001-Acme.pdf'),
      item('f2', '2026.03.16-ABC-2026-0002-Fót Kft.pdf'),
    ]);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="invoices-b1.zip"',
    );
    expect(zip.map((e) => e.name)).toEqual([
      '2026.03.15-ABC-2026-0001-Acme.pdf',
      '2026.03.16-ABC-2026-0002-Fót Kft.pdf',
    ]);
    expect(zip[0].data).toEqual(pdfBytes('f1'));
    expect(zip[1].data).toEqual(pdfBytes('f2'));
  });

  test('leaves out skipped files and files without a name', async () => {
    const { env } = await seed(['f1', 'f2', 'f3']);

    const { zip } = await download(env, [
      item('f1', 'keep.pdf'),
      item('f2', 'skipped.pdf', true),
      item('f3', null),
    ]);

    expect(zip.map((e) => e.name)).toEqual(['keep.pdf']);
  });

  test('suffixes duplicate names inside one ZIP', async () => {
    const { env } = await seed(['f1', 'f2']);

    const { zip } = await download(env, [
      item('f1', 'same.pdf'),
      item('f2', 'same.pdf'),
    ]);

    expect(zip.map((e) => e.name)).toEqual(['same.pdf', 'same_2.pdf']);
  });

  test('downloading the same batch twice gives the same names', async () => {
    const { env } = await seed(['f1']);
    const items = [item('f1', 'invoice.pdf')];

    const first = await download(env, items);
    const second = await download(env, items);

    expect(first.zip.map((e) => e.name)).toEqual(['invoice.pdf']);
    expect(second.zip.map((e) => e.name)).toEqual(['invoice.pdf']);
  });

  test('skips a file that is no longer in storage and still returns a valid ZIP', async () => {
    const { env } = await seed(['f1']);

    const { zip } = await download(env, [
      item('gone', 'gone.pdf'),
      item('f1', 'here.pdf'),
    ]);

    expect(zip.map((e) => e.name)).toEqual(['here.pdf']);
  });

  test('records each zipped file as processed for duplicate detection', async () => {
    const { bucket, env } = await seed(['f1', 'f2']);

    await download(env, [item('f1', 'one.pdf'), item('f2', 'two.pdf', true)]);

    expect(bucket.json('processed/sha-f1.json')).toEqual({
      originalName: 'f1.pdf',
      filename: 'one.pdf',
      batchId: 'b1',
      downloadedAt: expect.any(String),
    });
    expect(bucket.objects.has('processed/sha-f2.json')).toBe(false);
  });

  test('streams one stored PDF at a time', async () => {
    const ids = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];
    const { bucket, env } = await seed(ids);

    const { zip } = await download(
      env,
      ids.map((id) => item(id, `${id}-renamed.pdf`)),
    );

    expect(zip).toHaveLength(ids.length);
    expect(bucket.maxOpenBodies).toBe(1);
  });

  test('requires a batchId and items', async () => {
    const { env } = makeEnv();

    const res = await request(env, '/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: 'b1' }),
    });

    expect(res.status).toBe(400);
  });
});
