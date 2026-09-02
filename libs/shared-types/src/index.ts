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
