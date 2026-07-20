import type { Response } from 'express';
import type {
    CreateEventDto,
    EventParamsDto,
    ListEventsQueryDto,
    TenantEventParamsDto,
} from '@eventops/validation';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type { ApiKeyAuthenticatedRequest } from '../../middleware/require-api-key.js';
import {
    createEventForTenant,
    createEventViaApiKey,
    getEventForTenant,
    listEventsForTenant,
} from './events.service.js';

export async function listEvents(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantEventParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const { limit } = req.query as unknown as ListEventsQueryDto;
    const items = await listEventsForTenant(authToken, tenantId, { limit });
    return res.json({ items });
}

export async function getEvent(req: AuthenticatedRequest, res: Response) {
    const { tenantId, eventId } = req.params as EventParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const event = await getEventForTenant(authToken, tenantId, eventId);
    return res.json({ item: event });
}

export async function createEvent(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantEventParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const result = await createEventForTenant(
        req.authUser!,
        authToken,
        tenantId,
        req.body as CreateEventDto
    );
    return res.status(result.replayed ? 200 : 201).json({ item: result.event });
}

export async function createEventForApiKey(req: ApiKeyAuthenticatedRequest, res: Response) {
    const { id: apiKeyId, tenantId } = req.apiKey!;
    const result = await createEventViaApiKey(tenantId, apiKeyId, req.body as CreateEventDto);
    return res.status(result.replayed ? 200 : 201).json({ item: result.event });
}
