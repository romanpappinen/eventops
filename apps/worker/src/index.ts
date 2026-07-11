import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { createLogger } from '@eventops/logger';
import { parseWorkerEnv } from '@eventops/config';
import { runInvitationEmailWorker } from './invitation-email-worker.js';
import { runInvitationCleanupSweep } from './invitation-cleanup-sweep.js';

const envPath = path.resolve(process.cwd(), '../../.env');
dotenv.config({ path: envPath });

const env = parseWorkerEnv(process.env);
const logger = createLogger('worker');

logger.info(
    {
        redisConfigured: Boolean(env.REDIS_URL),
        invitationEmailBatchSize: env.INVITATION_EMAIL_BATCH_SIZE,
    },
    'Worker started'
);

async function main() {
    await Promise.all([runInvitationEmailWorker(), runInvitationCleanupSweep()]);
}

void main();
