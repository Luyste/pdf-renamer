import { describe, expect, test } from 'bun:test';
import { MAX_BATCH_SIZE, type UploadedFile } from '@org/shared-types';
import { makeEnv, pdfBytes, request, uploadPdf } from './helpers';

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(digest).toString('hex');
}

describe('POST /api/upload', () => {
  test('stores the PDF in staging with its name and content hash', async () => {
    const { bucket, env } = makeEnv();
    const bytes = pdfBytes('one');

    const res = await uploadPdf(env, 'b1', 'scan 01.pdf', bytes);
    const body: UploadedFile = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      fileId: expect.any(String),
      originalName: 'scan 01.pdf',
      alreadyProcessed: null,
    });
    const stored = bucket.objects.get(`staging/b1/${body.fileId}.pdf`);
    expect(stored?.bytes).toEqual(bytes);
    expect(stored?.customMetadata).toEqual({
      originalName: 'scan 01.pdf',
      sha256: await sha256(bytes),
    });
  });

  test('flags a file whose content was downloaded in an earlier batch', async () => {
    const { bucket, env } = makeEnv();
    const bytes = pdfBytes('seen before');
    const record = {
      originalName: 'old.pdf',
      filename: '2026.01.02-ABC-2026-0001-Acme.pdf',
      batchId: 'old-batch',
      downloadedAt: '2026-01-03T10:00:00.000Z',
    };
    await bucket.put(
      `processed/${await sha256(bytes)}.json`,
      JSON.stringify(record),
    );

    const res = await uploadPdf(env, 'b1', 'again.pdf', bytes);
    const body: UploadedFile = await res.json();

    expect(body.alreadyProcessed).toEqual(record);
  });

  test('rejects the file once the batch is full', async () => {
    const { bucket, env } = makeEnv();
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      await bucket.put(`staging/b1/f${i}.pdf`, pdfBytes(`${i}`));
    }

    const res = await uploadPdf(env, 'b1', 'one-too-many.pdf', pdfBytes('x'));

    expect(res.status).toBe(400);
    expect(bucket.objects.size).toBe(MAX_BATCH_SIZE);
  });

  test('requires a batchId', async () => {
    const { env } = makeEnv();
    const form = new FormData();
    form.append('file', new File([pdfBytes('x')], 'a.pdf'));

    const res = await request(env, '/api/upload', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
  });

  test('requires the file under the `file` form field', async () => {
    const { bucket, env } = makeEnv();
    const form = new FormData();
    form.append('files', new File([pdfBytes('x')], 'a.pdf'));

    const res = await request(env, '/api/upload?batchId=b1', {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });
});
