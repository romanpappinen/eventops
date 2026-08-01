import path from 'node:path';
import dotenv from 'dotenv';
import { createLogger } from '@eventops/logger';
import { parseApiEnv } from '@eventops/config';
import { createApp } from './app.js';

const logger = createLogger('api');

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

const env = parseApiEnv(process.env);
const app = createApp();

// Render (and most PaaS providers) assign the listen port via `PORT` at
// runtime; API_PORT stays the default for local development.
const port = process.env.PORT ? Number(process.env.PORT) : env.API_PORT;

app.listen(port, () => {
    logger.info({ port }, 'API server started');
});
