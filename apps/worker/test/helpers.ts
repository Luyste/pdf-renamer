import type { ParseResult } from '@org/shared-types';
import app from '../src/index';

type Stored = {
  bytes: Uint8Array;
  customMetadata: Record<string, string>;
  uploaded: Date;
};

/** In-memory stand-in for the slice of the R2 API the worker uses. Also
 * counts how many object bodies are being streamed at once, because the
 * download route must never hold more than one open. */
export class FakeR2 {
  objects = new Map<string, Stored>();
  openBodies = 0;
  maxOpenBodies = 0;

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    opts?: { customMetadata?: Record<string, string> },
  ) {
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : new Uint8Array(value);
    this.objects.set(key, {
      bytes,
      customMetadata: opts?.customMetadata ?? {},
      uploaded: new Date('2026-10-01T12:00:00Z'),
    });
  }

  async head(key: string) {
    const o = this.objects.get(key);
    return o
      ? { key, customMetadata: o.customMetadata, uploaded: o.uploaded }
      : null;
  }

  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) return null;
    const fake = this;
    return {
      key,
      customMetadata: o.customMetadata,
      uploaded: o.uploaded,
      get body() {
        fake.openBodies += 1;
        fake.maxOpenBodies = Math.max(fake.maxOpenBodies, fake.openBodies);
        let sent = false;
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent) {
              fake.openBodies -= 1;
              controller.close();
              return;
            }
            sent = true;
            controller.enqueue(o.bytes);
          },
        });
      },
      arrayBuffer: async () => o.bytes.slice().buffer,
      text: async () => new TextDecoder().decode(o.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(o.bytes)),
    };
  }

  async list({ prefix }: { prefix: string }) {
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix));
    return { objects: keys.sort().map((key) => ({ key })) };
  }

  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) this.objects.delete(key);
  }

  json(key: string) {
    const o = this.objects.get(key);
    return o ? JSON.parse(new TextDecoder().decode(o.bytes)) : undefined;
  }
}

type OcrHandler = (req: Request) => Response | Promise<Response>;

/** Env with a fake bucket and an OCR container whose fetch is `ocr`. */
export function makeEnv(
  ocr: OcrHandler = () => new Response('', { status: 503 }),
) {
  const bucket = new FakeR2();
  const env = {
    BUCKET: bucket,
    OCR_CONTAINER: {
      idFromName: () => 'default',
      get: () => ({ fetch: (req: Request) => ocr(req) }),
    },
  };
  return { bucket, env };
}

export function request(
  env: ReturnType<typeof makeEnv>['env'],
  path: string,
  init?: RequestInit,
) {
  return app.request(path, init, env);
}

export async function uploadPdf(
  env: ReturnType<typeof makeEnv>['env'],
  batchId: string,
  name: string,
  bytes: Uint8Array,
) {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type: 'application/pdf' }));
  const res = await request(env, `/api/upload?batchId=${batchId}`, {
    method: 'POST',
    body: form,
  });
  return res;
}

export function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  const ok = { value: 'x', raw: 'x', ok: true, note: '' };
  return {
    source: 'scan.pdf',
    invoice: ok,
    fulfil_date: ok,
    customer: ok,
    filename: '2026.03.15-ABC-2026-0042-KovacsKft.pdf',
    problems: [],
    confident: true,
    ocr_dump: {},
    ...overrides,
  };
}

/** Reads every `data:` payload from an SSE response body. */
export async function sseEvents(
  res: Response,
): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)));
}

/** Minimal ZIP reader for the STORED entries client-zip writes: walks the
 * central directory the way unzip/Explorer do and checks each CRC, so a
 * structurally broken archive fails here rather than on the customer's PC. */
export function readZip(buf: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('no end-of-central-directory record');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50)
      throw new Error('bad central header');
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(
      buf.subarray(p + 46, p + 46 + nameLen),
    );

    if (view.getUint32(local, true) !== 0x04034b50)
      throw new Error(`bad local header for ${name}`);
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    if (Bun.hash.crc32(data) !== crc)
      throw new Error(`CRC mismatch for ${name}`);

    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export const pdfBytes = (label: string) =>
  new TextEncoder().encode(`%PDF-1.4 fake pdf ${label}`);
