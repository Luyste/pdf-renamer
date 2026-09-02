import type { ConfirmItem, ParseResult } from '@org/shared-types';

export type UploadedFile = { fileId: string; originalName: string };

export async function uploadFiles(
  batchId: string,
  files: File[],
): Promise<UploadedFile[]> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await fetch(
    `/api/upload?batchId=${encodeURIComponent(batchId)}`,
    {
      method: 'POST',
      body: form,
    },
  );
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return res.json();
}

export function subscribeToParse(
  batchId: string,
  fileIds: string[],
  onResult: (r: ParseResult & { fileId: string }) => void,
  onDone: () => void,
) {
  const params = new URLSearchParams({ batchId, fileIds: fileIds.join(',') });
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
  const res = await fetch('/api/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, items }),
  });
  if (!res.ok) throw new Error(`confirm failed: ${res.status}`);
  return res.json();
}

export async function downloadBatch(batchId: string): Promise<Blob> {
  const res = await fetch(
    `/api/download?batchId=${encodeURIComponent(batchId)}`,
  );
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.blob();
}

export async function deleteBatch(batchId: string) {
  const res = await fetch(`/api/batch/${encodeURIComponent(batchId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}

export async function undoBatch(batchId: string) {
  const res = await fetch('/api/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  });
  if (!res.ok) throw new Error(`undo failed: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<{ ocr_lang: string }> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health failed: ${res.status}`);
  return res.json();
}
