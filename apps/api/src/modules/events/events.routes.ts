import { Router } from 'express';
import * as eventValidation from '../../../../../packages/validation/src/request/events.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createEvent, listEvents } from './events.controller.js';

export const eventsRouter = Router({ mergeParams: true });

eventsRouter.get(
    '/',
    requireAuth,
    validate(eventValidation.tenantEventParamsDtoSchema, 'params'),
    asyncHandler(listEvents)
);

eventsRouter.post(
    '/',
    requireAuth,
    validate(eventValidation.tenantEventParamsDtoSchema, 'params'),
    validate(eventValidation.createEventDtoSchema, 'body'),
    asyncHandler(createEvent)
);
