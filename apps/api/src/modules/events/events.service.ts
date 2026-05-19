import { ApiError } from '../../lib/api-error.js';
import { getSupabaseUser } from '../../lib/supabase.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type { CreateEventDto, ListEventsQueryDto } from '@eventops/validation';
import { normalizeEventRecord } from './events.types.js';

const eventSelectFields =
    'id, tenant_id, source, type, subject, occurred_at, received_at, payload, metadata, status, created_by_user_id, idempotency_key, created_at, updated_at';

export async function listEventsForTenant(
    authToken: string,
    tenantId: string,
    query: Pick<ListEventsQueryDto, 'limit'>
) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('events')
        .select(eventSelectFields)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(query.limit);

    if (error) {
        throw new ApiError(502, 'Failed to load events');
    }

    return (data ?? []).map(normalizeEventRecord);
}

export async function createEventForTenant(
    authUser: NonNullable<AuthenticatedRequest['authUser']>,
    authToken: string,
    tenantId: string,
    input: CreateEventDto
) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('events')
        .insert({
            tenant_id: tenantId,
            source: input.source,
            type: input.type,
            subject: input.subject ?? null,
            occurred_at: input.occurredAt,
            payload: input.payload,
            metadata: input.metadata ?? {},
            created_by_user_id: authUser.id,
        })
        .select(eventSelectFields)
        .single();

    if (error) {
        const message = error.message.toLowerCase();

        if (
            error.code === '42501' ||
            message.includes('row-level security') ||
            message.includes('permission denied')
        ) {
            throw new ApiError(404, 'Tenant not found');
        }

        throw new ApiError(502, 'Event creation is temporarily unavailable');
    }

    if (!data) {
        throw new ApiError(500, 'Event creation did not return a record');
    }

    return normalizeEventRecord(data);
}
