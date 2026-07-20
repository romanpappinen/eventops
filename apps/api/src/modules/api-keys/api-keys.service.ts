import { ApiError } from '../../lib/api-error.js';
import { getSupabaseUser } from '../../lib/supabase.js';
import { generateApiKey, normalizeApiKeyRecord } from './api-keys.types.js';
import type { ApiKeyRow } from './api-keys.types.js';

const apiKeySelectFields = 'id, tenant_id, name, key_prefix, created_at, last_used_at, revoked_at';

export async function listApiKeysForTenant(authToken: string, tenantId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data, error } = await supabaseUser
        .from('api_keys')
        .select(apiKeySelectFields)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (error) {
        throw new ApiError(502, 'Failed to load API keys');
    }

    return (data ?? []).map((row) => normalizeApiKeyRecord(row as ApiKeyRow));
}

export async function createApiKeyForTenant(authToken: string, tenantId: string, createdByUserId: string, name: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    const { data, error } = await supabaseUser
        .from('api_keys')
        .insert({
            tenant_id: tenantId,
            name,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            created_by_user_id: createdByUserId,
        })
        .select(apiKeySelectFields)
        .single();

    if (error) {
        const message = error.message.toLowerCase();

        if (
            error.code === '42501' ||
            message.includes('row-level security') ||
            message.includes('permission denied')
        ) {
            throw new ApiError(403, 'Only tenant owners can create API keys');
        }

        throw new ApiError(502, 'Failed to create API key');
    }

    if (!data) {
        throw new ApiError(500, 'API key creation did not return a record');
    }

    return { ...normalizeApiKeyRecord(data as ApiKeyRow), rawKey };
}

export async function revokeApiKeyForTenant(authToken: string, tenantId: string, apiKeyId: string) {
    const supabaseUser = getSupabaseUser(authToken);
    const { data: existing, error: findError } = await supabaseUser
        .from('api_keys')
        .select(apiKeySelectFields)
        .eq('tenant_id', tenantId)
        .eq('id', apiKeyId)
        .maybeSingle();

    if (findError) {
        throw new ApiError(502, 'Failed to load API key');
    }

    if (!existing) {
        throw new ApiError(404, 'API key not found');
    }

    const existingRow = existing as ApiKeyRow;

    if (existingRow.revoked_at) {
        return normalizeApiKeyRecord(existingRow);
    }

    const { data, error } = await supabaseUser
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', apiKeyId)
        .select(apiKeySelectFields)
        .single();

    if (error) {
        const message = error.message.toLowerCase();

        if (
            error.code === '42501' ||
            message.includes('row-level security') ||
            message.includes('permission denied')
        ) {
            throw new ApiError(403, 'Only tenant owners can revoke API keys');
        }

        throw new ApiError(502, 'Failed to revoke API key');
    }

    if (!data) {
        throw new ApiError(500, 'API key revoke did not return a record');
    }

    return normalizeApiKeyRecord(data as ApiKeyRow);
}
