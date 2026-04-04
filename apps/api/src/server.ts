import path from 'node:path';
import dotenv from 'dotenv';
import { parseApiEnv } from '@eventops/config';
import { createApp } from './app.js';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

console.log('envPath api:', envPath);
console.log('SUPABASE_URL api:', process.env.SUPABASE_URL);

const env = parseApiEnv(process.env);
const app = createApp();

app.listen(env.API_PORT, () => {
    console.log(`API running on http://localhost:${env.API_PORT}`);
});
