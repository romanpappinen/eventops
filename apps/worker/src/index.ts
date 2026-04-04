import path from 'node:path';
import dotenv from 'dotenv';
import { parseWorkerEnv } from '@eventops/config';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

console.log('envPath worker:', envPath);
console.log('REDIS_URL worker:', process.env.REDIS_URL);

const env = parseWorkerEnv(process.env);

console.log('Worker started');
console.log(`Redis URL configured: ${Boolean(env.REDIS_URL)}`);
