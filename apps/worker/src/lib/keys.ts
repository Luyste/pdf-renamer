export function stagingKey(batchId: string, fileId: string): string {
  return `staging/${batchId}/${fileId}.pdf`;
}

export function stagingPrefix(batchId: string): string {
  return `staging/${batchId}/`;
}

/** Small JSON pointer recording a file's outcome (status + final filename) —
 * never the PDF bytes themselves. The PDF stays in its one staging/ copy. */
export function metaKey(batchId: string, fileId: string): string {
  return `meta/${batchId}/${fileId}.json`;
}

export function metaPrefix(batchId: string): string {
  return `meta/${batchId}/`;
}

/** Cached OCR result (the same ParseResult sent over SSE), persisted so
 * GET /api/batch/:id can rehydrate full state without re-running OCR. */
export function parsedKey(batchId: string, fileId: string): string {
  return `parsed/${batchId}/${fileId}.json`;
}

export function parsedPrefix(batchId: string): string {
  return `parsed/${batchId}/`;
}

/** Cross-batch, content-hash-keyed record used only for "already processed"
 * duplicate detection. Deliberately NOT deleted by batch cleanup. */
export function processedKey(sha256: string): string {
  return `processed/${sha256}.json`;
}

/** Pick a filename that doesn't collide with any name already used in this
 * batch, appending _2, _3... before the extension. */
export function nextAvailableName(
  usedNames: Set<string>,
  name: string,
): string {
  if (!usedNames.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);

  let n = 2;
  let candidate = `${base}_${n}${ext}`;
  while (usedNames.has(candidate)) {
    n += 1;
    candidate = `${base}_${n}${ext}`;
  }
  return candidate;
}
