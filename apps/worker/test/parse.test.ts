import { describe, expect, test } from 'bun:test';
import { makeEnv, parseResult, pdfBytes, request, sseEvents } from './helpers';

/** OCR stand-in that answers with a result named after the uploaded file. */
function ocrNamingByFile(calls: string[] = []) {
  return async (req: Request) => {
    const file = (await req.formData()).get('file') as File;
    calls.push(file.name);
    return Response.json(
      parseResult({ source: file.name, filename: `renamed-${file.name}` }),
    );
  };
}

async function seed(
  bucket: ReturnType<typeof makeEnv>['bucket'],
  ids: string[],
) {
  for (const id of ids) {
    await bucket.put(`staging/b1/${id}.pdf`, pdfBytes(id), {
      customMetadata: { originalName: `${id}.pdf`, sha256: id },
    });
  }
}

describe('GET /api/parse', () => {
  test('streams one result per file, stores it, then signals done', async () => {
    const { bucket, env } = makeEnv(ocrNamingByFile());
    await seed(bucket, ['f1', 'f2']);

    const events = await sseEvents(await request(env, '/api/parse?batchId=b1'));

    expect(events.at(-1)).toEqual({ done: true });
    const results = events.slice(0, -1);
    expect(results.map((r) => r.fileId).sort()).toEqual(['f1', 'f2']);
    expect(results.find((r) => r.fileId === 'f1')?.filename).toBe(
      'renamed-f1.pdf',
    );
    expect(bucket.json('parsed/b1/f1.json').filename).toBe('renamed-f1.pdf');
    expect(bucket.json('parsed/b1/f2.json').filename).toBe('renamed-f2.pdf');
  });

  test('parses only the requested fileIds', async () => {
    const calls: string[] = [];
    const { bucket, env } = makeEnv(ocrNamingByFile(calls));
    await seed(bucket, ['f1', 'f2', 'f3']);

    await sseEvents(await request(env, '/api/parse?batchId=b1&fileIds=f1,f3'));

    expect(calls.sort()).toEqual(['f1.pdf', 'f3.pdf']);
  });

  test('a failing file is reported without stopping the others', async () => {
    const calls: string[] = [];
    const { bucket, env } = makeEnv(async (req) => {
      const file = (await req.formData()).get('file') as File;
      calls.push(file.name);
      if (file.name === 'bad.pdf') return new Response('nope', { status: 422 });
      return Response.json(parseResult());
    });
    await seed(bucket, ['bad', 'good']);

    const events = await sseEvents(await request(env, '/api/parse?batchId=b1'));

    const bad = events.find((e) => e.fileId === 'bad');
    expect(bad).toMatchObject({
      source: 'bad.pdf',
      filename: null,
      confident: false,
      problems: ['ocr-service returned 422'],
    });
    expect(events.find((e) => e.fileId === 'good')?.confident).toBe(true);
    expect(events.at(-1)).toEqual({ done: true });
    // A 4xx means the PDF is the problem, so it is not retried, and nothing
    // is stored: a reload tries the file again.
    expect(calls.filter((c) => c === 'bad.pdf')).toHaveLength(1);
    expect(bucket.objects.has('parsed/b1/bad.json')).toBe(false);
    expect(bucket.objects.has('parsed/b1/good.json')).toBe(true);
  });

  test('retries a container that is still starting', async () => {
    let attempts = 0;
    const { bucket, env } = makeEnv(() => {
      attempts += 1;
      if (attempts === 1) throw new Error('container not ready');
      if (attempts === 2) return new Response('', { status: 503 });
      return Response.json(parseResult());
    });
    await seed(bucket, ['f1']);

    const events = await sseEvents(await request(env, '/api/parse?batchId=b1'));

    expect(attempts).toBe(3);
    expect(events[0]).toMatchObject({ fileId: 'f1', confident: true });
  });

  test('gives up after three 5xx answers', async () => {
    let attempts = 0;
    const { bucket, env } = makeEnv(() => {
      attempts += 1;
      return new Response('', { status: 503 });
    });
    await seed(bucket, ['f1']);

    const events = await sseEvents(await request(env, '/api/parse?batchId=b1'));

    expect(attempts).toBe(3);
    expect(events[0]).toMatchObject({
      fileId: 'f1',
      problems: ['ocr-service returned 503'],
    });
  });

  test('sends at most two files to the OCR container at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { bucket, env } = makeEnv(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Bun.sleep(5);
      inFlight -= 1;
      return Response.json(parseResult());
    });
    await seed(bucket, ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);

    const events = await sseEvents(await request(env, '/api/parse?batchId=b1'));

    expect(events).toHaveLength(7);
    expect(maxInFlight).toBe(2);
  });

  test('requires a batchId', async () => {
    const { env } = makeEnv();

    expect((await request(env, '/api/parse')).status).toBe(400);
  });
});
