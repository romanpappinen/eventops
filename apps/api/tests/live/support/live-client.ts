import type { Express } from 'express';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: string) {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required env var ${name} for live tests`);
    }

    return value;
}

function uniqueSuffix() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function uniqueEmail(prefix: string) {
    return `live-${prefix}-${uniqueSuffix()}@example.com`.toLowerCase();
}

export function uniqueSlug(prefix: string) {
    return `${prefix}-${uniqueSuffix()}`.toLowerCase();
}

export function getServiceRoleClient() {
    return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export function getAnonClient() {
    return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export interface LiveTestUser {
    id: string;
    email: string;
    password: string;
    accessToken: string;
}

export async function registerAndSignIn(
    app: Express,
    options?: { firstName?: string; lastName?: string; password?: string; emailPrefix?: string; email?: string }
): Promise<LiveTestUser> {
    const email = options?.email ?? uniqueEmail(options?.emailPrefix ?? 'user');
    const password = options?.password ?? 'LiveTestPassword123!';

    const registerResponse = await request(app).post('/auth/register').send({
        firstName: options?.firstName ?? 'Live',
        lastName: options?.lastName ?? 'Test',
        email,
        password,
    });

    if (registerResponse.status !== 201) {
        throw new Error(
            `Live test registration failed for ${email}: ${registerResponse.status} ` +
                JSON.stringify(registerResponse.body)
        );
    }

    const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });

    if (error || !data.session) {
        throw new Error(`Live test sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
    }

    return {
        id: registerResponse.body.item.id,
        email,
        password,
        accessToken: data.session.access_token,
    };
}

export async function signIn(email: string, password: string) {
    const { data, error } = await getAnonClient().auth.signInWithPassword({ email, password });

    if (error || !data.session) {
        throw new Error(`Live test sign-in failed for ${email}: ${error?.message ?? 'no session'}`);
    }

    return data.session.access_token;
}

/** Fetches the raw invitation accept token the worker would normally email out.
 *  invitation_email_jobs lives in a private schema not exposed via PostgREST,
 *  so this goes through the same RPC the worker itself would use, since no
 *  worker runs in these tests. */
export async function getInvitationAcceptToken(invitationId: string) {
    const { data, error } = await getServiceRoleClient().rpc('get_invitation_email_job_accept_token', {
        p_invitation_id: invitationId,
    });

    if (error) {
        throw new Error(`Failed to read invitation accept token: ${error.message}`);
    }

    if (!data) {
        throw new Error(`No accept token queued for invitation ${invitationId}`);
    }

    return data as string;
}

/** Deletes tenants first (cascades memberships/invitations/events), then users
 *  (public.users row + the auth.users record) — tenants.created_by_user_id has
 *  no cascade, so users must be deleted after their tenants. */
export async function cleanupLiveTestData(options: { tenantIds?: string[]; userIds?: string[] }) {
    const admin = getServiceRoleClient();
    const tenantIds = options.tenantIds ?? [];
    const userIds = options.userIds ?? [];

    if (tenantIds.length > 0) {
        await admin.from('tenants').delete().in('id', tenantIds);
    }

    if (userIds.length > 0) {
        await admin.from('users').delete().in('id', userIds);
        await Promise.all(userIds.map((id) => admin.auth.admin.deleteUser(id).catch(() => undefined)));
    }
}
