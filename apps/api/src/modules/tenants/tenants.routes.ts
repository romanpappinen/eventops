import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import {
    archiveTenant,
    createTenant,
    createTenantInvitation,
    getTenant,
    listTenantInvitations,
    listTenants,
    revokeTenantInvitation,
    updateTenant,
} from './tenants.controller.js';
import { requireTenantAccess } from './tenant-access.middleware.js';
import {
    createTenantSchema,
    inviteTenantMemberSchema,
    tenantInvitationRouteParamsSchema,
    tenantParamsSchema,
    updateTenantSchema,
} from './tenant.schemas.js';

export const tenantsRouter = Router();

tenantsRouter.get('/', requireAuth, asyncHandler(listTenants));
tenantsRouter.post('/', requireAuth, validate(createTenantSchema, 'body'), asyncHandler(createTenant));
tenantsRouter.get(
    '/:tenantId',
    requireAuth,
    validate(tenantParamsSchema, 'params'),
    requireTenantAccess(),
    asyncHandler(getTenant)
);
tenantsRouter.patch(
    '/:tenantId',
    requireAuth,
    validate(tenantParamsSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    validate(updateTenantSchema, 'body'),
    asyncHandler(updateTenant)
);
tenantsRouter.delete(
    '/:tenantId',
    requireAuth,
    validate(tenantParamsSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    asyncHandler(archiveTenant)
);
tenantsRouter.post(
    '/:tenantId/invitations',
    requireAuth,
    validate(tenantParamsSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    validate(inviteTenantMemberSchema, 'body'),
    asyncHandler(createTenantInvitation)
);
tenantsRouter.get(
    '/:tenantId/invitations',
    requireAuth,
    validate(tenantParamsSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    asyncHandler(listTenantInvitations)
);
tenantsRouter.delete(
    '/:tenantId/invitations/:invitationId',
    requireAuth,
    validate(tenantInvitationRouteParamsSchema, 'params'),
    requireTenantAccess({ minimumRole: 'owner' }),
    asyncHandler(revokeTenantInvitation)
);
