const KEY = 'pdf-renamer:active-batch-id';

export function loadActiveBatchId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveActiveBatchId(batchId: string) {
  try {
    localStorage.setItem(KEY, batchId);
  } catch {
    // storage unavailable — batch just won't survive a reload
  }
}

export function clearActiveBatchId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
