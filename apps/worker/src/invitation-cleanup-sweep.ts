import { createLogger } from '@eventops/logger';
import { parseWorkerEnv } from '@eventops/config';
import { deleteTerminalInvitationEmailJobsOlderThan } from './lib/supabase-rest.js';

const logger = createLogger('worker:invitation-cleanup-sweep');

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeRetentionCutoff(retentionDays: number, now: Date) {
    return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

export async function runInvitationCleanupSweepOnce() {
    const env = parseWorkerEnv(process.env);
    const cutoff = computeRetentionCutoff(env.INVITATION_EMAIL_JOB_RETENTION_DAYS, new Date());

    return deleteTerminalInvitationEmailJobsOlderThan(cutoff);
}

export async function runInvitationCleanupSweepTick() {
    try {
        const deletedCount = await runInvitationCleanupSweepOnce();

        if (deletedCount > 0) {
            logger.info({ deletedCount }, 'Invitation cleanup sweep removed terminal job(s)');
        }
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Invitation cleanup sweep failed';
        logger.error({ err: error }, message);
    }
}

export async function runInvitationCleanupSweep() {
    logger.info('Invitation cleanup sweep started');

    while (true) {
        await runInvitationCleanupSweepTick();
        await sleep(SWEEP_INTERVAL_MS);
    }
}
