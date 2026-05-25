import { parseWorkerEnv } from '@eventops/config';
import { sendTenantInvitationEmail } from './lib/resend.js';
import {
    claimInvitationEmailJob,
    getInvitationById,
    getTenantById,
    getUserById,
    listPendingInvitationEmailJobs,
    updateInvitationEmailJob,
    updateTenantInvitation,
} from './lib/supabase-rest.js';

interface InvitationEmailJobRow {
    id: string;
    invitation_id: string;
    attempts: number;
    accept_token: string | null;
}

interface TenantInvitationRow {
    id: string;
    tenant_id: string;
    email: string;
    role: string;
    status: string;
    invited_by_user_id: string;
}

interface TenantRow {
    id: string;
    name: string;
    status: string;
}

interface UserRow {
    id: string;
    email: string;
    full_name?: string | null;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildInviteLink(baseUrl: string, token: string) {
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBaseUrl}/accept-invite?token=${encodeURIComponent(token)}`;
}

async function fetchPendingJobs(limit: number) {
    return listPendingInvitationEmailJobs(limit);
}

async function claimJob(jobId: string) {
    return claimInvitationEmailJob(jobId);
}

async function loadInvitationContext(invitationId: string) {
    const invitation = await getInvitationById(invitationId);

    if (!invitation) {
        return null;
    }

    const tenant = await getTenantById(invitation.tenant_id);
    const inviter = await getUserById(invitation.invited_by_user_id);

    if (!tenant || !inviter) {
        return null;
    }

    return {
        invitation: invitation as TenantInvitationRow,
        tenant: tenant as TenantRow,
        inviter: inviter as UserRow,
    };
}

async function markJobSuccess(job: InvitationEmailJobRow, messageId: string) {
    const now = new Date().toISOString();
    const nextAttempts = job.attempts + 1;

    await updateInvitationEmailJob(job.id, {
        status: 'sent',
        attempts: nextAttempts,
        accept_token: null,
        last_error: null,
        processed_at: now,
        updated_at: now,
    });

    await updateTenantInvitation(job.invitation_id, {
        email_delivery_status: 'sent',
        email_sent_at: now,
        email_message_id: messageId,
        email_delivery_error: null,
        delivery_attempts: nextAttempts,
    });
}

async function markJobFailure(job: InvitationEmailJobRow, errorMessage: string) {
    const env = parseWorkerEnv(process.env);
    const nextAttempts = job.attempts + 1;
    const terminal = nextAttempts >= env.INVITATION_EMAIL_MAX_ATTEMPTS;
    const now = new Date();
    const retryAt = new Date(now.getTime() + nextAttempts * env.INVITATION_EMAIL_POLL_INTERVAL_MS);

    await updateInvitationEmailJob(job.id, {
        status: terminal ? 'failed' : 'pending',
        attempts: nextAttempts,
        accept_token: terminal ? null : job.accept_token,
        last_error: errorMessage,
        scheduled_at: terminal ? now.toISOString() : retryAt.toISOString(),
        processed_at: terminal ? now.toISOString() : null,
        updated_at: now.toISOString(),
    });

    await updateTenantInvitation(job.invitation_id, {
        email_delivery_status: 'failed',
        email_delivery_error: errorMessage,
        delivery_attempts: nextAttempts,
    });
}

async function processJob(job: InvitationEmailJobRow) {
    const env = parseWorkerEnv(process.env);
    const context = await loadInvitationContext(job.invitation_id);

    if (!context) {
        await markJobFailure(job, 'Invitation context not found');
        return;
    }

    if (context.invitation.status !== 'pending') {
        await markJobFailure(job, 'Invitation is no longer pending');
        return;
    }

    if (context.tenant.status !== 'active') {
        await markJobFailure(job, 'Tenant is archived');
        return;
    }

    if (!job.accept_token) {
        await markJobFailure(job, 'Invitation accept token not found');
        return;
    }

    const result = await sendTenantInvitationEmail({
        inviterEmail: context.inviter.email,
        inviterName: context.inviter.full_name ?? null,
        recipientEmail: context.invitation.email,
        role: context.invitation.role,
        tenantName: context.tenant.name,
        inviteLink: buildInviteLink(env.APP_WEB_BASE_URL, job.accept_token),
    });

    await markJobSuccess(job, result.messageId);
}

export async function runInvitationEmailWorker() {
    const env = parseWorkerEnv(process.env);

    console.log('Invitation email worker started');

    while (true) {
        try {
            const jobs = await fetchPendingJobs(env.INVITATION_EMAIL_BATCH_SIZE);

            for (const job of jobs) {
                const claimedJob = await claimJob(job.id);

                if (!claimedJob) {
                    continue;
                }

                try {
                    await processJob(job);
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : 'Invitation email processing failed';
                    await markJobFailure(job, message);
                }
            }
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Invitation email polling failed';
            console.error(message);
        }

        await sleep(env.INVITATION_EMAIL_POLL_INTERVAL_MS);
    }
}
