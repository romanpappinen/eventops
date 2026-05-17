import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { getSupabaseAdmin } from '../../lib/supabase.js';
import { ensureUserProfile } from '../auth/ensure-user-profile.js';
import type {
    CreateTenantInput,
    InviteTenantMemberInput,
    UpdateTenantInput,
} from './tenant.schemas.js';

const tenantErrorStatus = Symbol('tenantErrorStatus');

type TenantServiceError = Error & {
    [tenantErrorStatus]?: number;
};

function createTenantError(message: string, statusCode: number) {
    const error = new Error(message) as TenantServiceError;
    error[tenantErrorStatus] = statusCode;
    return error;
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

export function getTenantErrorStatus(error: unknown) {
    if (typeof error === 'object' && error !== null && tenantErrorStatus in error) {
        const statusCode = (error as TenantServiceError)[tenantErrorStatus];
        if (typeof statusCode === 'number') {
            return statusCode;
        }
    }

    return 500;
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

export async function listTenantsForUser(userId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
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

export async function getTenantByIdForUser(userId: string, tenantId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
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

    const { data: membership, error: membershipError } = await supabaseAdmin
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
    input: CreateTenantInput
) {
    await ensureUserProfile({
        id: authUser.id,
        email: authUser.email ?? 'unknown@example.com',
        fullName: authUser.fullName,
        avatarUrl: authUser.avatarUrl,
    });

    const supabaseAdmin = getSupabaseAdmin();
    const slug = input.slug ?? toSlug(input.name);

    if (!slug) {
        throw createTenantError('Tenant slug cannot be empty', 400);
    }

    const { data, error } = await supabaseAdmin.rpc('create_tenant_with_owner', {
        p_name: input.name,
        p_slug: slug,
        p_description: input.description ?? null,
        p_created_by_user_id: authUser.id,
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
    userId: string,
    tenantId: string,
    input: UpdateTenantInput
) {
    const supabaseAdmin = getSupabaseAdmin();
    const updates: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
    };

    if (input.name !== undefined) {
        updates.name = input.name;
    }

    if (input.description !== undefined) {
        updates.description = input.description ?? null;
    }

    if (input.slug !== undefined) {
        updates.slug = input.slug;
    }

    const { data, error } = await supabaseAdmin
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .eq('created_by_user_id', userId)
        .select('id, name, description, slug, plan, status, created_at, created_by_user_id, updated_at')
        .single();

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('json object requested') || message.includes('no rows')) {
            throw createTenantError('Tenant not found', 404);
        }

        mapSupabaseError(error, 'Tenant slug already exists');
    }

    if (!data) {
        throw createTenantError('Tenant not found', 404);
    }

    return normalizeTenantRecord(data);
}

export async function archiveTenantForUser(userId: string, tenantId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
        .from('tenants')
        .update({
            status: 'archived',
            updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId)
        .eq('created_by_user_id', userId)
        .select('id, name, description, slug, plan, status, created_at, created_by_user_id, updated_at')
        .single();

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('json object requested') || message.includes('no rows')) {
            throw createTenantError('Tenant not found', 404);
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
    tenantId: string,
    input: InviteTenantMemberInput
) {
    if (authUser.email && authUser.email.toLowerCase() === input.email) {
        throw createTenantError('You cannot invite yourself', 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.rpc('create_tenant_invitation', {
        p_tenant_id: tenantId,
        p_email: input.email,
        p_role: input.role,
        p_invited_by_user_id: authUser.id,
    });

    if (error) {
        const message = error.message?.toLowerCase() ?? '';

        if (message.includes('only tenant owners')) {
            throw createTenantError('Only tenant owners can invite members', 403);
        }

        if (message.includes('already an active member')) {
            throw createTenantError('User is already an active member of this tenant', 409);
        }

        mapSupabaseError(error, 'An invitation for this email already exists');
    }

    const invitation = Array.isArray(data) ? data[0] : data;

    if (!invitation) {
        throw createTenantError('Invitation creation did not return a record', 500);
    }

    return invitation;
}
