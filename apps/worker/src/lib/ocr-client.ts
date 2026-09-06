import type { Env } from '../env';

function stub(env: Env) {
  const id = env.OCR_CONTAINER.idFromName('default');
  return env.OCR_CONTAINER.get(id);
}

export async function ocrParse(
  env: Env,
  filename: string,
  body: ArrayBuffer,
  requestId: string,
): Promise<Response> {
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'application/pdf' }), filename);
  const request = new Request('http://ocr-service/parse', {
    method: 'POST',
    body: form,
    headers: { 'X-Request-Id': requestId },
  });
  return stub(env).fetch(request);
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
