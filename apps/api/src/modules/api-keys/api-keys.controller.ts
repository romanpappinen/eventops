import type { Response } from 'express';
import type { ApiKeyParamsDto, CreateApiKeyDto, TenantApiKeyParamsDto } from '@eventops/validation';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import {
    createApiKeyForTenant,
    listApiKeysForTenant,
    revokeApiKeyForTenant,
} from './api-keys.service.js';

export async function listApiKeys(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantApiKeyParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const items = await listApiKeysForTenant(authToken, tenantId);
    return res.json({ items });
}

export async function createApiKey(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantApiKeyParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const { name } = req.body as CreateApiKeyDto;
    const item = await createApiKeyForTenant(authToken, tenantId, req.authUser!.id, name);
    return res.status(201).json({ item });
}

export async function revokeApiKey(req: AuthenticatedRequest, res: Response) {
    const { tenantId, apiKeyId } = req.params as ApiKeyParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const item = await revokeApiKeyForTenant(authToken, tenantId, apiKeyId);
    return res.json({ item });
}
