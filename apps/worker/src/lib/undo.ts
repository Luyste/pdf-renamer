import { undoLogKey } from './keys';

export type UndoEntry = {
  fileId: string;
  from: string;
  to: string;
  originalName: string;
};

export async function appendUndoLog(
  bucket: R2Bucket,
  batchId: string,
  entries: UndoEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const key = undoLogKey(batchId);
  const existing = await bucket.get(key);
  const prior = existing ? await existing.text() : '';
  const appended = `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`;
  await bucket.put(key, prior + appended);
}

export async function readUndoLog(
  bucket: R2Bucket,
  batchId: string,
): Promise<UndoEntry[]> {
  const obj = await bucket.get(undoLogKey(batchId));
  if (!obj) return [];
  const text = await obj.text();
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as UndoEntry);
}

export async function clearUndoLog(
  bucket: R2Bucket,
  batchId: string,
): Promise<void> {
  await bucket.delete(undoLogKey(batchId));
}
