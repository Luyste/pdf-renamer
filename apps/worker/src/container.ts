import { Container } from '@cloudflare/containers';
import type { Env } from './env';

export class OcrContainer extends Container<Env> {
  override defaultPort = 8080;
  override sleepAfter = '5m';
}
