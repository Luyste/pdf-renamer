import { Hono } from 'hono';
import type { AppBindings } from './env';
import { requestLogging } from './lib/request-logging';
import { batch } from './routes/batch';
import { clientLog } from './routes/client-log';
import { confirm } from './routes/confirm';
import { download } from './routes/download';
import { health } from './routes/health';
import { parse } from './routes/parse';
import { upload } from './routes/upload';

export { OcrContainer } from './container';

const app = new Hono<AppBindings>();

app.use('*', requestLogging);

app.onError((err, c) => {
  const logger = c.get('logger');
  logger.error('request.unhandled_error', {
    error: err.message,
    stack: err.stack,
  });
  return c.json(
    { error: 'internal error', requestId: c.get('requestId') },
    500,
  );
});

app.route('/', upload);
app.route('/', parse);
app.route('/', confirm);
app.route('/', download);
app.route('/', batch);
app.route('/', health);
app.route('/', clientLog);

export default app;
