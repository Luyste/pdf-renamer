import type { ParseResult } from '@org/shared-types';

export type FileStatus = 'parsing' | 'parsed' | 'confirmed' | 'skipped';

export type FileEntry = {
  fileId: string;
  originalName: string;
  status: FileStatus;
  result: ParseResult | null;
  filename: string;
};

export type StatusColor = 'red' | 'amber' | 'green';

export function statusColor(entry: FileEntry): StatusColor {
  if (!entry.result || !entry.filename) return 'red';
  if (!entry.result.confident) return 'amber';
  return 'green';
}

export function sortEntries(entries: FileEntry[]): FileEntry[] {
  const rank: Record<StatusColor, number> = { red: 0, amber: 1, green: 2 };
  return [...entries].sort(
    (a, b) => rank[statusColor(a)] - rank[statusColor(b)],
  );
}
