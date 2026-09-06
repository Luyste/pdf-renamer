import type {
  BatchState,
  ConfirmItem,
  ParseResult,
  UploadedFile,
} from '@org/shared-types';
import { apiFetch } from './http';

export async function fetchBatchState(batchId: string): Promise<BatchState> {
  const res = await apiFetch(`/api/batch/${encodeURIComponent(batchId)}`);
  return res.json();
}

export async function deleteFile(batchId: string, fileId: string) {
  await apiFetch(
    `/api/batch/${encodeURIComponent(batchId)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  );
}

export async function uploadFiles(
  batchId: string,
  files: File[],
): Promise<UploadedFile[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await apiFetch(
    `/api/upload?batchId=${encodeURIComponent(batchId)}`,
    { method: 'POST', body: form },
  );
  return res.json();
}

export function subscribeToParse(
  batchId: string,
  fileIds: string[],
  onResult: (r: ParseResult & { fileId: string }) => void,
  onDone: () => void,
) {
  // EventSource can't set custom headers, so the correlation id rides
  // along as a query param instead — the worker's request-logging
  // middleware accepts either.
  const params = new URLSearchParams({
    batchId,
    fileIds: fileIds.join(','),
    requestId: crypto.randomUUID(),
  });
  const source = new EventSource(`/api/parse?${params.toString()}`);
  source.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.done) {
      onDone();
      source.close();
      return;
    }
    onResult(data);
  };
  source.onerror = () => {
    source.close();
    onDone();
  };
  return () => source.close();
}

export async function confirmBatch(batchId: string, items: ConfirmItem[]) {
  const res = await apiFetch('/api/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, items }),
  });
  return res.json();
}

export async function downloadBatch(batchId: string): Promise<Blob> {
  const res = await apiFetch(
    `/api/download?batchId=${encodeURIComponent(batchId)}`,
  );
  return res.blob();
}

export async function deleteBatch(batchId: string) {
  await apiFetch(`/api/batch/${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
  });
}

export async function undoBatch(batchId: string) {
  const res = await apiFetch('/api/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  });
  return res.json();
}

export async function fetchHealth(): Promise<{ ocr_lang: string }> {
  const res = await apiFetch('/api/health');
  return res.json();
}

export function reportClientLog(
  level: 'info' | 'warn' | 'error',
  msg: string,
  context?: Record<string, unknown>,
) {
  // Fire-and-forget — logging must never itself throw or block the UI.
  apiFetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, msg, context }),
  }).catch(() => {});
}
