import type { OcrContainer } from './container';
import type { Logger } from './lib/logger';

export type Env = {
  BUCKET: R2Bucket;
  OCR_CONTAINER: DurableObjectNamespace<OcrContainer>;
};

export type Variables = {
  requestId: string;
  logger: Logger;
};

/** Shared Hono generic — `Hono<AppBindings>()` everywhere so every route
 * gets typed `c.get('logger')` / `c.get('requestId')`. */
export type AppBindings = { Bindings: Env; Variables: Variables };
