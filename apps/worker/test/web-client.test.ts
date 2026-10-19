import { afterEach, describe, expect, test } from 'bun:test';
import type { BatchState } from '@org/shared-types';
// Declared as an implicitDependency in package.json instead, so Nx doesn't
// treat the worker's TypeScript build as depending on the web app's.
// nx-ignore-next-line
import {
  downloadBatch,
  fetchBatchState,
  uploadFiles,
} from '../../web/src/lib/api';
// nx-ignore-next-line
import { ApiError } from '../../web/src/lib/http';
import { makeEnv, parseResult, readZip, request } from './helpers';

// The browser code and the worker routes agree on field names and payload
// shapes only by convention. Running the real web client against the real
// worker catches the two drifting apart, e.g. a renamed form field.
const realFetch = globalThis.fetch;

function routeFetchTo(env: ReturnType<typeof makeEnv>['env']) {
  globalThis.fetch = ((input: string, init?: RequestInit) =>
    request(env, input, init)) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('web client against the worker', () => {
  test('upload, then download, round-trips the files', async () => {
    const { bucket, env } = makeEnv();
    routeFetchTo(env);
    const files = [
      new File(['%PDF one'], 'one.pdf', { type: 'application/pdf' }),
      new File(['%PDF two'], 'two.pdf', { type: 'application/pdf' }),
    ];

    const uploaded: { fileId: string; originalName: string }[] = [];
    await uploadFiles('b1', files, (u) => uploaded.push(u));

    expect(uploaded.map((u) => u.originalName)).toEqual(['one.pdf', 'two.pdf']);

    for (const u of uploaded) {
      await bucket.put(
        `parsed/b1/${u.fileId}.json`,
        JSON.stringify(parseResult()),
      );
    }
    const state: BatchState = await fetchBatchState('b1');
    expect(state.entries.every((e) => e.status === 'parsed')).toBe(true);

    const blob = await downloadBatch(
      'b1',
      uploaded.map((u, i) => ({
        token: u.fileId,
        original: u.originalName,
        filename: `renamed-${i}.pdf`,
      })),
    );
    const zip = readZip(new Uint8Array(await blob.arrayBuffer()));

    expect(zip.map((e) => e.name)).toEqual(['renamed-0.pdf', 'renamed-1.pdf']);
    expect(new TextDecoder().decode(zip[1].data)).toBe('%PDF two');
  });

  test('a rejected request surfaces as an ApiError with the worker’s request id', async () => {
    const { bucket, env } = makeEnv();
    routeFetchTo(env);
    for (let i = 0; i < 50; i++) await bucket.put(`staging/b1/f${i}.pdf`, 'x');

    const error = await uploadFiles(
      'b1',
      [new File(['x'], 'x.pdf')],
      () => {},
    ).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
