import { randomBytes } from 'node:crypto';
import { sha256Hex } from '@eventops/shared';

export interface ApiKeyRow {
    id: string;
    tenant_id: string;
    name: string;
    key_prefix: string;
    created_at?: string | null;
    last_used_at?: string | null;
    revoked_at?: string | null;
}

export interface ApiKeyItem {
    id: string;
    tenantId: string;
    name: string;
    keyPrefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}

export function normalizeApiKeyRecord(record: ApiKeyRow): ApiKeyItem {
    return {
        id: record.id,
        tenantId: record.tenant_id,
        name: record.name,
        keyPrefix: record.key_prefix,
        createdAt: record.created_at ?? '',
        lastUsedAt: record.last_used_at ?? null,
        revokedAt: record.revoked_at ?? null,
    };
}

const API_KEY_PREFIX = 'eo_live_';

export function hashApiKey(rawKey: string): string {
    return sha256Hex(rawKey);
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
    const secret = randomBytes(32).toString('base64url');
    const rawKey = `${API_KEY_PREFIX}${secret}`;

    return {
        rawKey,
        keyHash: hashApiKey(rawKey),
        keyPrefix: rawKey.slice(0, API_KEY_PREFIX.length + 10),
    };
}
