import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { getSupabaseAdmin, getSupabaseUser } from '../../lib/supabase.js';
import { ApiError } from '../../lib/api-error.js';
import { ensureUserProfile } from '../auth/ensure-user-profile.js';
import { createHash, randomBytes } from 'node:crypto';
import type {
    AcceptInvitationInput,
    CreateTenantInput,
    InvitationAcceptLookup,
    InviteTenantMemberInput,
    TenantInvitationParams,
    TenantInvitationRouteParams,
    UpdateTenantInput,
} from './tenant.schemas.js';

function createTenantError(message: string, statusCode: number) {
    return new ApiError(statusCode, message);
}

function normalizeTenantRecord(record: {
    id: string;
    name: string;
    description?: string | null;
    slug: string;
    plan: string;
    status: string;
    created_at?: string;
    created_by_user_id?: string;
    updated_at?: string;
}) {
    return {
        id: record.id,
        name: record.name,
        description: record.description ?? null,
        slug: record.slug,
        plan: record.plan,
        status: record.status,
        created_at: record.created_at,
        created_by_user_id: record.created_by_user_id,
        updated_at: record.updated_at,
    };
}

function toSlug(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function mapSupabaseError(error: { message?: string } | null, duplicateMessage: string) {
    const message = error?.message?.toLowerCase() ?? '';

    if (message.includes('duplicate') || message.includes('unique')) {
        throw createTenantError(duplicateMessage, 409);
    }

    throw createTenantError('Tenant operation is temporarily unavailable', 502);
}

type TenantInvitationRecord = {
    id: string;
    tenant_id: string;
    email: string;
    role: string;
    status: string;
    invited_by_user_id: string;
    created_at?: string | null;
    accepted_at?: string | null;
    email_delivery_status?: string;
    email_sent_at?: string | null;
    email_message_id?: string | null;
    email_delivery_error?: string | null;
    delivery_attempts?: number;
    accept_token_expires_at?: string | null;
};

function normalizeInvitationRecord(record: TenantInvitationRecord) {
    return {
        ...record,
        email_delivery_status: record.email_delivery_status ?? 'pending',
        email_sent_at: record.email_sent_at ?? null,
        email_message_id: record.email_message_id ?? null,
        email_delivery_error: record.email_delivery_error ?? null,
        delivery_attempts: record.delivery_attempts ?? 0,
        accept_token_expires_at: record.accept_token_expires_at ?? null,
    };
}

function createInvitationAcceptToken() {
    return randomBytes(24).toString('hex');
}

function hashInvitationAcceptToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}

async function enqueueInvitationEmail(invitationId: string, acceptToken: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from('invitation_email_jobs').upsert(
        {
            invitation_id: invitationId,
            status: 'pending',
            accept_token: acceptToken,
            scheduled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        {
            onConflict: 'invitation_id',
        }
    );

    if (error) {
        throw error;
    }
}

async function markInvitationDeliveryFailed(invitationId: string, errorMessage: string) {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
        .from('tenant_invitations')
        .update({
            email_delivery_status: 'failed',
            email_delivery_error: errorMessage,
            delivery_attempts: 0,
        })
        .eq('id', invitationId);
}

async function updateInvitationAcceptToken(invitationId: string, acceptToken: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin
        .from('tenant_invitations')
        .update({
            accept_token_hash: hashInvitationAcceptToken(acceptToken),
            accept_token_expires_at: expiresAt,
            accept_token_used_at: null,
        })
        .eq('id', invitationId);

    if (error) {
        throw error;
    }

    return expiresAt;
}

export async function listTenantsForUser(authToken: string, userId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('memberships')
        .select(`
      id,
      role,
      status,
      tenant:tenants (
        id,
        name,
        description,
        slug,
        plan,
        status,
        created_at
      )
    `)
        .eq('user_id', userId)
        .eq('status', 'active');

    if (error) {
        throw createTenantError('Failed to load tenants', 502);
    }

    return data;
}

export async function getTenantByIdForUser(authToken: string, userId: string, tenantId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('tenants')
        .select('id, name, description, slug, plan, status, created_at, created_by_user_id, updated_at')
        .eq('id', tenantId)
        .maybeSingle();

    if (error) {
        throw createTenantError('Failed to load tenant', 502);
    }

    if (!data) {
        throw createTenantError('Tenant not found', 404);
    }

    const { data: membership, error: membershipError } = await supabaseUser
        .from('memberships')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

    if (membershipError) {
        throw createTenantError('Failed to load tenant', 502);
    }

    if (!membership) {
        throw createTenantError('Tenant not found', 404);
    }

    return normalizeTenantRecord(data);
}

export async function createTenantForUser(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    authToken: string,
    input: CreateTenantInput
) {
    await ensureUserProfile(authToken, {
        id: authUser.id,
        email: authUser.email ?? 'unknown@example.com',
        fullName: authUser.fullName,
        avatarUrl: authUser.avatarUrl,
    });

    const supabaseUser = getSupabaseUser(authToken);
    const slug = input.slug ?? toSlug(input.name);

    if (!slug) {
        throw createTenantError('Tenant slug cannot be empty', 400);
    }

    const { data, error } = await supabaseUser.rpc('create_tenant_with_owner', {
        p_name: input.name,
        p_slug: slug,
        p_description: input.description ?? null,
    });

    if (error) {
        mapSupabaseError(error, 'Tenant slug already exists');
    }

    const tenant = Array.isArray(data) ? data[0] : data;

    if (!tenant) {
        throw createTenantError('Tenant creation did not return a tenant', 500);
    }

    return tenant;
}

export async function updateTenantForUser(
    authToken: string,
    tenantId: string,
    input: UpdateTenantInput
) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('update_tenant', {
        p_tenant_id: tenantId,
        p_name: input.name ?? null,
        p_slug: input.slug ?? null,
        p_description: input.description ?? null,
        p_description_provided: input.description !== undefined,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('tenant not found')) {
            throw createTenantError('Tenant not found', 404);
        }

        if (message.includes('only tenant owners')) {
            throw createTenantError('Forbidden', 403);
        }

        mapSupabaseError(error, 'Tenant slug already exists');
    }

    if (!data) {
        throw createTenantError('Tenant not found', 404);
    }

    return normalizeTenantRecord(data);
}

export async function archiveTenantForUser(authToken: string, tenantId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('archive_tenant', {
        p_tenant_id: tenantId,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('tenant not found')) {
            throw createTenantError('Tenant not found', 404);
        }

        if (message.includes('only tenant owners')) {
            throw createTenantError('Forbidden', 403);
        }

        throw createTenantError('Tenant archive failed', 502);
    }

    if (!data) {
        throw createTenantError('Tenant not found', 404);
    }

    return normalizeTenantRecord(data);
}

export async function inviteTenantMember(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    authToken: string,
    tenantId: string,
    input: InviteTenantMemberInput
) {
    if (authUser.email && authUser.email.toLowerCase() === input.email) {
        throw createTenantError('You cannot invite yourself', 400);
    }

    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('create_tenant_invitation', {
        p_tenant_id: tenantId,
        p_email: input.email,
        p_role: input.role,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('only tenant owners')) {
            throw createTenantError('Only tenant owners can invite members', 403);
        }

        if (message.includes('already an active member')) {
            throw createTenantError('User is already an active member of this tenant', 409);
        }

        if (message.includes('archived tenants cannot invite members')) {
            throw createTenantError('Tenant is archived', 409);
        }

        mapSupabaseError(error, 'An invitation for this email already exists');
    }

    const invitation = Array.isArray(data) ? data[0] : data;

    if (!invitation) {
        throw createTenantError('Invitation creation did not return a record', 500);
    }

    const normalizedInvitation = normalizeInvitationRecord(invitation as TenantInvitationRecord);
    const acceptToken = createInvitationAcceptToken();

    try {
        const expiresAt = await updateInvitationAcceptToken(normalizedInvitation.id, acceptToken);
        await enqueueInvitationEmail(normalizedInvitation.id, acceptToken);

        return {
            ...normalizedInvitation,
            accept_token_expires_at: expiresAt,
        };
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'Failed to queue invitation email delivery';
        await markInvitationDeliveryFailed(normalizedInvitation.id, message);

        return {
            ...normalizedInvitation,
            email_delivery_status: 'failed',
            email_delivery_error: message,
        };
    }
}

export async function listTenantInvitationsForOwner(authToken: string, tenantId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('tenant_invitations')
        .select(
            'id, tenant_id, email, role, status, invited_by_user_id, created_at, accepted_at, email_delivery_status, email_sent_at, email_message_id, email_delivery_error, delivery_attempts, accept_token_expires_at'
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (error) {
        throw createTenantError('Failed to load tenant invitations', 502);
    }

    return (data ?? []).map((invitation) =>
        normalizeInvitationRecord(invitation as TenantInvitationRecord)
    );
}

export async function revokeTenantInvitationForOwner(
    authToken: string,
    params: TenantInvitationRouteParams
) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('revoke_tenant_invitation', {
        p_tenant_id: params.tenantId,
        p_invitation_id: params.invitationId,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('only tenant owners')) {
            throw createTenantError('Forbidden', 403);
        }

        if (message.includes('invitation is no longer pending')) {
            throw createTenantError('Invitation is no longer pending', 409);
        }

        if (message.includes('invitation not found')) {
            throw createTenantError('Invitation not found', 404);
        }

        throw createTenantError('Invitation revocation failed', 502);
    }

    const invitation = Array.isArray(data) ? data[0] : data;

    if (!invitation) {
        throw createTenantError('Invitation revocation did not return a record', 500);
    }

    return normalizeInvitationRecord(invitation as TenantInvitationRecord);
}

export async function getInvitationByToken(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    query: InvitationAcceptLookup
) {
    const supabaseAdmin = getSupabaseAdmin();
    const tokenHash = hashInvitationAcceptToken(query.token);
    const { data, error } = await supabaseAdmin
        .from('tenant_invitations')
        .select('id, tenant_id, email, role, status, accepted_at, invited_by_user_id, accept_token_expires_at')
        .eq('accept_token_hash', tokenHash)
        .maybeSingle();

    if (error) {
        throw createTenantError('Failed to load invitation', 502);
    }

    if (!data) {
        throw createTenantError('Invitation not found', 404);
    }

    if (!authUser.email || authUser.email.toLowerCase() !== data.email.toLowerCase()) {
        throw createTenantError('This invitation belongs to a different email address', 403);
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
        .from('tenants')
        .select('id, name, status')
        .eq('id', data.tenant_id)
        .maybeSingle();

    if (tenantError) {
        throw createTenantError('Failed to load invitation', 502);
    }

    const isExpired =
        typeof data.accept_token_expires_at === 'string' &&
        new Date(data.accept_token_expires_at).getTime() <= Date.now();

    let state: 'pending' | 'accepted' | 'revoked' | 'expired' | 'archived' = data.status;

    if (tenant?.status !== 'active') {
        state = 'archived';
    } else if (isExpired && data.status === 'pending') {
        state = 'expired';
    }

    return {
        invitationId: data.id,
        tenantId: data.tenant_id,
        tenantName: tenant?.name ?? 'Unknown tenant',
        role: data.role,
        status: state,
        expiresAt: data.accept_token_expires_at ?? null,
    };
}

export async function acceptTenantInvitationByTokenForUser(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    authToken: string,
    input: AcceptInvitationInput
) {
    await ensureUserProfile(authToken, {
        id: authUser.id,
        email: authUser.email ?? 'unknown@example.com',
        fullName: authUser.fullName,
        avatarUrl: authUser.avatarUrl,
    });

    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('accept_tenant_invitation_by_token', {
        p_token_hash: hashInvitationAcceptToken(input.token),
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('invitation not found')) {
            throw createTenantError('Invitation not found', 404);
        }

        if (message.includes('invitation has expired')) {
            throw createTenantError('Invitation has expired', 409);
        }

        if (message.includes('does not belong to authenticated user')) {
            throw createTenantError('This invitation belongs to a different email address', 403);
        }

        if (message.includes('archived tenants cannot accept invitations')) {
            throw createTenantError('Tenant is archived', 409);
        }

        throw createTenantError('Invitation acceptance failed', 502);
    }

    const membership = Array.isArray(data) ? data[0] : data;

    if (!membership) {
        throw createTenantError('Invitation acceptance did not return a membership', 500);
    }

    return membership;
}

export async function acceptTenantInvitationForUser(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    authToken: string,
    invitationId: TenantInvitationParams['invitationId']
) {
    await ensureUserProfile(authToken, {
        id: authUser.id,
        email: authUser.email ?? 'unknown@example.com',
        fullName: authUser.fullName,
        avatarUrl: authUser.avatarUrl,
    });

    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser.rpc('accept_tenant_invitation', {
        p_invitation_id: invitationId,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('invitation not found')) {
            throw createTenantError('Invitation not found', 404);
        }

        if (message.includes('does not belong to authenticated user')) {
            throw createTenantError('Forbidden', 403);
        }

        if (message.includes('archived tenants cannot accept invitations')) {
            throw createTenantError('Tenant is archived', 409);
        }

        throw createTenantError('Invitation acceptance failed', 502);
    }

    const membership = Array.isArray(data) ? data[0] : data;

    if (!membership) {
        throw createTenantError('Invitation acceptance did not return a membership', 500);
    }

    return membership;
}
