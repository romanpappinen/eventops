import { parseWorkerEnv } from '@eventops/config';

interface PostgrestQueryOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Record<string, string>;
    select?: string;
    prefer?: string;
}

async function postgrestRequest<T>(table: string, options: PostgrestQueryOptions = {}) {
    const env = parseWorkerEnv(process.env);
    const url = new URL(`${env.SUPABASE_URL}/rest/v1/${table}`);

    if (options.select) {
        url.searchParams.set('select', options.select);
    }

    for (const [key, value] of Object.entries(options.query ?? {})) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...(options.prefer ? { Prefer: options.prefer } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as T) : null;

    if (!response.ok) {
        const message =
            typeof data === 'object' && data !== null && 'message' in data
                ? String((data as { message?: string }).message ?? 'Supabase request failed')
                : 'Supabase request failed';
        throw new Error(message);
    }

    return data;
}

export async function listPendingInvitationEmailJobs(limit: number) {
    return (
        (await postgrestRequest<
            Array<{ id: string; invitation_id: string; attempts: number; accept_token: string | null }>
        >('rpc/list_pending_invitation_email_jobs', {
            method: 'POST',
            body: { p_limit: limit },
        })) ?? []
    );
}

export async function claimInvitationEmailJob(jobId: string) {
    const rows =
        (await postgrestRequest<Array<{ id: string; invitation_id: string; attempts: number }>>(
            'rpc/claim_invitation_email_job',
            {
                method: 'POST',
                body: { p_job_id: jobId },
            }
        )) ?? [];

    return rows[0] ?? null;
}

export async function getInvitationById(invitationId: string) {
    const rows =
        (await postgrestRequest<
            Array<{
                id: string;
                tenant_id: string;
                email: string;
                role: string;
                status: string;
                invited_by_user_id: string;
            }>
        >('tenant_invitations', {
            query: {
                id: `eq.${invitationId}`,
                limit: '1',
            },
            select: 'id,tenant_id,email,role,status,invited_by_user_id',
        })) ?? [];

    return rows[0] ?? null;
}

export async function getTenantById(tenantId: string) {
    const rows =
        (await postgrestRequest<
            Array<{
                id: string;
                name: string;
                status: string;
            }>
        >('tenants', {
            query: {
                id: `eq.${tenantId}`,
                limit: '1',
            },
            select: 'id,name,status',
        })) ?? [];

    return rows[0] ?? null;
}

export async function getUserById(userId: string) {
    const rows =
        (await postgrestRequest<
            Array<{
                id: string;
                email: string;
                full_name?: string | null;
            }>
        >('users', {
            query: {
                id: `eq.${userId}`,
                limit: '1',
            },
            select: 'id,email,full_name',
        })) ?? [];

    return rows[0] ?? null;
}

export async function markInvitationEmailJobSent(jobId: string, attempts: number) {
    await postgrestRequest('rpc/mark_invitation_email_job_sent', {
        method: 'POST',
        body: { p_job_id: jobId, p_attempts: attempts },
    });
}

export async function markInvitationEmailJobFailed(
    jobId: string,
    params: {
        status: 'pending' | 'failed';
        attempts: number;
        lastError: string;
        scheduledAt: string;
        terminal: boolean;
    }
) {
    await postgrestRequest('rpc/mark_invitation_email_job_failed', {
        method: 'POST',
        body: {
            p_job_id: jobId,
            p_status: params.status,
            p_attempts: params.attempts,
            p_last_error: params.lastError,
            p_scheduled_at: params.scheduledAt,
            p_terminal: params.terminal,
        },
    });
}

export async function deleteTerminalInvitationEmailJobsOlderThan(cutoffIso: string) {
    const deletedCount = await postgrestRequest<number>('rpc/delete_terminal_invitation_email_jobs_older_than', {
        method: 'POST',
        body: { p_cutoff: cutoffIso },
    });

    return deletedCount ?? 0;
}

export async function updateTenantInvitation(invitationId: string, payload: Record<string, unknown>) {
    await postgrestRequest('tenant_invitations', {
        method: 'PATCH',
        body: payload,
        query: {
            id: `eq.${invitationId}`,
        },
    });
}

export async function listAcceptedEvents(limit: number) {
    return (
        (await postgrestRequest<
            Array<{
                id: string;
                payload: Record<string, unknown>;
                metadata: Record<string, unknown>;
            }>
        >('events', {
            query: {
                status: 'eq.accepted',
                order: 'created_at.asc',
                limit: String(limit),
            },
            select: 'id,payload,metadata',
        })) ?? []
    );
}

export async function markEventProcessed(eventId: string) {
    await postgrestRequest('events', {
        method: 'PATCH',
        body: {
            status: 'processed',
            failure_reason: null,
            updated_at: new Date().toISOString(),
        },
        query: {
            id: `eq.${eventId}`,
            status: 'eq.accepted',
        },
    });
}

export async function markEventFailed(eventId: string, reason: string) {
    await postgrestRequest('events', {
        method: 'PATCH',
        body: {
            status: 'failed',
            failure_reason: reason,
            updated_at: new Date().toISOString(),
        },
        query: {
            id: `eq.${eventId}`,
            status: 'eq.accepted',
        },
    });
}
