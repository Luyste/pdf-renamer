import type { OcrContainer } from './container';

export type Env = {
  BUCKET: R2Bucket;
  OCR_CONTAINER: DurableObjectNamespace<OcrContainer>;
};
