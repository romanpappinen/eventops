import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { hashApiKey } from '../modules/api-keys/api-keys.types.js';

export interface ApiKeyAuthenticatedRequest extends Request {
    apiKey?: {
        id: string;
        tenantId: string;
    };
}

export async function requireApiKey(req: ApiKeyAuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const rawKey = authHeader.slice('Bearer '.length).trim();
    const keyHash = hashApiKey(rawKey);
    const admin = getSupabaseAdmin();

    try {
        const { data, error } = await admin
            .from('api_keys')
            .select('id, tenant_id, revoked_at')
            .eq('key_hash', keyHash)
            .maybeSingle();

        if (error) {
            return res.status(503).json({ error: 'Auth service unavailable' });
        }

        if (!data || data.revoked_at) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.apiKey = { id: data.id, tenantId: data.tenant_id };

        // Bookkeeping only -- never block or fail the ingestion request on this.
        admin
            .from('api_keys')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id)
            .then(null, () => undefined);

        next();
    } catch {
        return res.status(503).json({ error: 'Auth service unavailable' });
    }
}
