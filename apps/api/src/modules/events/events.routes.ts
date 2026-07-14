import { Router } from 'express';
import * as eventValidation from '@eventops/validation';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createEvent, getEvent, listEvents } from './events.controller.js';
import { requireTenantAccess } from '../tenants/tenant-access.middleware.js';

export const eventsRouter = Router({ mergeParams: true });

eventsRouter.get(
    '/',
    requireAuth,
    validate(eventValidation.tenantEventParamsDtoSchema, 'params'),
    requireTenantAccess(),
    validate(eventValidation.listEventsQueryDtoSchema, 'query'),
    asyncHandler(listEvents)
);

eventsRouter.get(
    '/:eventId',
    requireAuth,
    validate(eventValidation.eventParamsDtoSchema, 'params'),
    requireTenantAccess(),
    asyncHandler(getEvent)
);

eventsRouter.post(
    '/',
    requireAuth,
    validate(eventValidation.tenantEventParamsDtoSchema, 'params'),
    requireTenantAccess(),
    validate(eventValidation.createEventDtoSchema, 'body'),
    asyncHandler(createEvent)
);
