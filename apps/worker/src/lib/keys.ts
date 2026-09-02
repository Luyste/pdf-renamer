export function stagingKey(batchId: string, fileId: string): string {
  return `staging/${batchId}/${fileId}.pdf`;
}

export function stagingPrefix(batchId: string): string {
  return `staging/${batchId}/`;
}

export function doneKey(batchId: string, filename: string): string {
  return `done/${batchId}/${filename}`;
}

export function donePrefix(batchId: string): string {
  return `done/${batchId}/`;
}

export function reviewPrefix(batchId: string): string {
  return `review/${batchId}/`;
}

export function undoLogKey(batchId: string): string {
  return `undo/${batchId}.jsonl`;
}

/** Find a non-colliding key under `prefix{name}`, appending _2, _3... before the extension. */
export async function nextAvailableKey(
  bucket: R2Bucket,
  prefix: string,
  name: string,
): Promise<string> {
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);

  let candidate = `${prefix}${name}`;
  let n = 2;
  while ((await bucket.head(candidate)) !== null) {
    candidate = `${prefix}${base}_${n}${ext}`;
    n += 1;
  }
  return candidate;
}
