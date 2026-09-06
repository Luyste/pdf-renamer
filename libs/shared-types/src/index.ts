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
 * confirmed once before — used to flag duplicate uploads. */
export type ProcessedRecord = {
  originalName: string;
  filename: string;
  batchId: string;
  confirmedAt: string;
};

export type UploadedFile = {
  fileId: string;
  originalName: string;
  alreadyProcessed: ProcessedRecord | null;
};
