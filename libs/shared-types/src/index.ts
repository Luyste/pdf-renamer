export const MAX_BATCH_SIZE = 50;

export type Field = {
  value: string | null;
  raw: string;
  ok: boolean;
  note: string;
};

export type ParseResult = {
  source: string;
  invoice: Field;
  fulfil_date: Field;
  customer: Field;
  filename: string | null;
  problems: string[];
  confident: boolean;
  ocr_dump: Record<string, string>;
  thumb?: string; // base64 PNG, from /parse
};

export type ConfirmItem = {
  token: string;
  original: string;
  filename: string | null;
  skip?: boolean;
};

/** Cross-batch record proving a file (by content hash) was already
 * downloaded once before — used to flag duplicate uploads. Written only
 * once a file is actually zipped and handed to the user, not merely
 * confirmed — an unconfirmed or undone confirm should never count. */
export type ProcessedRecord = {
  originalName: string;
  filename: string;
  batchId: string;
  downloadedAt: string;
};

export type UploadedFile = {
  fileId: string;
  originalName: string;
  alreadyProcessed: ProcessedRecord | null;
};

export type FileStatus = 'parsing' | 'parsed' | 'confirmed' | 'skipped';

export type FileEntry = {
  fileId: string;
  originalName: string;
  status: FileStatus;
  result: ParseResult | null;
  filename: string;
  alreadyProcessed: ProcessedRecord | null;
};

/** Full server-side truth for a batch — the payload behind GET
 * /api/batch/:batchId, used to (re)hydrate the UI from scratch. */
export type BatchState = {
  batchId: string;
  entries: FileEntry[];
};
