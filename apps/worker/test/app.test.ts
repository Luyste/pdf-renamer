import { describe, expect, test } from 'bun:test';
import { makeEnv, request } from './helpers';

describe('worker app', () => {
  test('echoes the caller’s request id', async () => {
    const { env } = makeEnv();

    const res = await request(env, '/api/batch/b1', {
      headers: { 'X-Request-Id': 'req-123' },
    });

    expect(res.headers.get('X-Request-Id')).toBe('req-123');
  });

  test('mints a request id when the caller sends none', async () => {
    const { env } = makeEnv();

    const res = await request(env, '/api/batch/b1');

    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('turns an unexpected error into a 500 carrying the request id', async () => {
    const { bucket, env } = makeEnv();
    bucket.list = async () => {
      throw new Error('R2 is down');
    };

    const res = await request(env, '/api/batch/b1', {
      headers: { 'X-Request-Id': 'req-500' },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'internal error',
      requestId: 'req-500',
    });
  });

  test('passes the OCR health check through', async () => {
    const { env } = makeEnv((req) =>
      new URL(req.url).pathname === '/health'
        ? Response.json({ ocr_lang: 'hun+eng' })
        : new Response('', { status: 404 }),
    );

    const res = await request(env, '/api/health');

    expect(await res.json()).toEqual({ ocr_lang: 'hun+eng' });
  });
});
