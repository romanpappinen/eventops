import { Router } from 'express';
import * as eventValidation from '@eventops/validation';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireApiKey } from '../../middleware/require-api-key.js';
import { validate } from '../../middleware/validate.js';
import { createEventForApiKey } from './events.controller.js';

export const eventsIngestRouter = Router();

eventsIngestRouter.post(
    '/',
    requireApiKey,
    validate(eventValidation.createEventDtoSchema, 'body'),
    asyncHandler(createEventForApiKey)
);
