import { Hono } from 'hono';
import type { Env } from './env';
import { batch } from './routes/batch';
import { confirm } from './routes/confirm';
import { download } from './routes/download';
import { health } from './routes/health';
import { parse } from './routes/parse';
import { undo } from './routes/undo';
import { upload } from './routes/upload';

export { OcrContainer } from './container';

const app = new Hono<{ Bindings: Env }>();

app.route('/', upload);
app.route('/', parse);
app.route('/', confirm);
app.route('/', download);
app.route('/', batch);
app.route('/', undo);
app.route('/', health);

export default app;
