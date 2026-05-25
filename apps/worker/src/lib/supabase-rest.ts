import { parseWorkerEnv } from '@eventops/config';

interface PostgrestQueryOptions {
    method?: 'GET' | 'POST' | 'PATCH';
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
    return (await postgrestRequest<
        Array<{ id: string; invitation_id: string; attempts: number; accept_token: string | null }>
    >(
        'invitation_email_jobs',
        {
            query: {
                status: 'eq.pending',
                scheduled_at: `lte.${new Date().toISOString()}`,
                order: 'scheduled_at.asc',
                limit: String(limit),
            },
            select: 'id,invitation_id,attempts,accept_token',
        }
    )) ?? [];
}

export async function claimInvitationEmailJob(jobId: string) {
    const rows =
        (await postgrestRequest<
            Array<{ id: string; invitation_id: string; attempts: number }>
        >(
            'invitation_email_jobs',
            {
                method: 'PATCH',
                body: {
                    status: 'processing',
                    accept_token: null,
                    updated_at: new Date().toISOString(),
                },
                query: {
                    id: `eq.${jobId}`,
                    status: 'eq.pending',
                },
                select: 'id,invitation_id,attempts',
                prefer: 'return=representation',
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

export async function updateInvitationEmailJob(
    jobId: string,
    payload: Record<string, unknown>
) {
    await postgrestRequest('invitation_email_jobs', {
        method: 'PATCH',
        body: payload,
        query: {
            id: `eq.${jobId}`,
        },
    });
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
