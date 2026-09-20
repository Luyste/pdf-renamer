import type { Env } from '../env';

function stub(env: Env) {
  const id = env.OCR_CONTAINER.idFromName('default');
  return env.OCR_CONTAINER.get(id);
}

const ATTEMPTS = 3;

/** The container sleeps when idle, so the first request of a batch can hit a
 * cold start and come back 5xx (or throw outright) before the service is up.
 * Retry those; a 4xx means the PDF itself is the problem, so it stands. */
async function withRetry(send: () => Promise<Response>): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await send();
      if (res.status < 500 || attempt === ATTEMPTS) return res;
    } catch (err) {
      if (attempt === ATTEMPTS) throw err;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 500 * 2 ** (attempt - 1)),
    );
  }
}

export async function ocrParse(
  env: Env,
  filename: string,
  body: ArrayBuffer,
  requestId: string,
): Promise<Response> {
  const blob = new Blob([body], { type: 'application/pdf' });
  // A fresh FormData/Request per attempt — a request body can only be read once.
  return withRetry(() => {
    const form = new FormData();
    form.append('file', blob, filename);
    return stub(env).fetch(
      new Request('http://ocr-service/parse', {
        method: 'POST',
        body: form,
        headers: { 'X-Request-Id': requestId },
      }),
    );
  });
}

export async function ocrHealth(
  env: Env,
  requestId: string,
): Promise<Response> {
  const request = new Request('http://ocr-service/health', {
    headers: { 'X-Request-Id': requestId },
  });
  return stub(env).fetch(request);
}
