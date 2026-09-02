import type { Env } from '../env';

function stub(env: Env) {
  const id = env.OCR_CONTAINER.idFromName('default');
  return env.OCR_CONTAINER.get(id);
}

export async function ocrParse(
  env: Env,
  filename: string,
  body: ArrayBuffer,
): Promise<Response> {
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'application/pdf' }), filename);
  const request = new Request('http://ocr-service/parse', {
    method: 'POST',
    body: form,
  });
  return stub(env).fetch(request);
}

export async function ocrHealth(env: Env): Promise<Response> {
  const request = new Request('http://ocr-service/health');
  return stub(env).fetch(request);
}
