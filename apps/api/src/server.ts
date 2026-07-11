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

app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, 'API server started');
});
