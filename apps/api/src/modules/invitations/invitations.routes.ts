import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import {
    acceptInvitation,
    acceptInvitationById,
    getInvitation,
    getPendingInvitation,
} from './invitations.controller.js';
import {
    acceptInvitationByIdSchema,
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
invitationsRouter.get('/pending-for-me', requireAuth, asyncHandler(getPendingInvitation));
invitationsRouter.post(
    '/accept-by-id',
    requireAuth,
    validate(acceptInvitationByIdSchema, 'body'),
    asyncHandler(acceptInvitationById)
);
