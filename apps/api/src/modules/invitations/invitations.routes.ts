import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { acceptInvitation, getInvitation } from './invitations.controller.js';
import {
    acceptInvitationSchema,
    invitationAcceptLookupSchema,
} from '../tenants/tenant.schemas.js';

export const invitationsRouter = Router();

invitationsRouter.get(
    '/accept',
    requireAuth,
    validate(invitationAcceptLookupSchema, 'query'),
    asyncHandler(getInvitation)
);
invitationsRouter.post(
    '/accept',
    requireAuth,
    validate(acceptInvitationSchema, 'body'),
    asyncHandler(acceptInvitation)
);
