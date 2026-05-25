import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { parseWorkerEnv } from '@eventops/config';
import { runInvitationEmailWorker } from './invitation-email-worker.js';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

const env = parseWorkerEnv(process.env);

console.log('Worker started');
console.log(`Redis URL configured: ${Boolean(env.REDIS_URL)}`);
console.log(`Invitation email batch size: ${env.INVITATION_EMAIL_BATCH_SIZE}`);

async function main() {
    await runInvitationEmailWorker();
}

void main();
