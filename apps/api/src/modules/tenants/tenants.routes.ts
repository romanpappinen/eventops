import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import {
    archiveTenant,
    createTenant,
    createTenantInvitation,
    getTenant,
    listTenants,
    updateTenant,
} from './tenants.controller.js';
import { requireTenantAccess } from './tenant-access.middleware.js';

export const tenantsRouter = Router();

tenantsRouter.get('/', requireAuth, listTenants);
tenantsRouter.post('/', requireAuth, createTenant);
tenantsRouter.get('/:tenantId', requireAuth, requireTenantAccess(), getTenant);
tenantsRouter.patch('/:tenantId', requireAuth, requireTenantAccess({ minimumRole: 'owner' }), updateTenant);
tenantsRouter.delete('/:tenantId', requireAuth, requireTenantAccess({ minimumRole: 'owner' }), archiveTenant);
tenantsRouter.post(
    '/:tenantId/invitations',
    requireAuth,
    requireTenantAccess({ minimumRole: 'owner' }),
    createTenantInvitation
);
