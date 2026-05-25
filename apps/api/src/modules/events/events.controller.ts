import type { Response } from 'express';
import { z } from 'zod';
import type {
    CreateEventDto,
    ListEventsQueryDto,
    TenantEventParamsDto,
} from '@eventops/validation';
import { ApiError } from '../../lib/api-error.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { createEventForTenant, listEventsForTenant } from './events.service.js';

const listEventsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
}).strict();

export async function listEvents(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantEventParamsDto;
    const authToken = req.authToken;
    const parsedQuery = listEventsQuerySchema.safeParse(req.query);

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    if (!parsedQuery.success) {
        throw new ApiError(400, 'Invalid request', parsedQuery.error.flatten());
    }

    const { limit } = parsedQuery.data as ListEventsQueryDto;
    const items = await listEventsForTenant(authToken, tenantId, { limit });
    return res.json({ items });
}

export async function createEvent(req: AuthenticatedRequest, res: Response) {
    const { tenantId } = req.params as TenantEventParamsDto;
    const authToken = req.authToken;

    if (!authToken) {
        throw new Error('Authenticated request is missing access token');
    }

    const event = await createEventForTenant(
        req.authUser!,
        authToken,
        tenantId,
        req.body as CreateEventDto
    );
    return res.status(201).json({ item: event });
}
