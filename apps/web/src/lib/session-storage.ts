import type { FileEntry } from './types';

const KEY = 'pdf-renamer:session:v1';

type SessionData = {
  batchId: string;
  entries: Record<string, FileEntry>;
};

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function saveSession(data: SessionData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — session persistence is best-effort
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
