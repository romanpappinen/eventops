import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type { TenantParams } from './tenant.schemas.js';
import {
    archiveTenantForUser,
    createTenantForUser,
    getTenantByIdForUser,
    inviteTenantMember,
    listTenantsForUser,
    updateTenantForUser,
} from './tenant.service.js';
import type { TenantAuthorizedRequest } from './tenant-access.middleware.js';

export async function listTenants(req: AuthenticatedRequest, res: Response) {
    const items = await listTenantsForUser(req.authUser!.id);
    return res.json({ items });
}

export async function createTenant(req: AuthenticatedRequest, res: Response) {
    const tenant = await createTenantForUser(req.authUser!, req.body);
    return res.status(201).json({ item: tenant });
}

export async function getTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await getTenantByIdForUser(req.authUser!.id, tenantId);
    return res.json({ item: tenant });
}

export async function updateTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await updateTenantForUser(req.authUser!.id, tenantId, req.body);
    return res.json({ item: tenant });
}

export async function archiveTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await archiveTenantForUser(req.authUser!.id, tenantId);
    return res.json({ item: tenant });
}

export async function createTenantInvitation(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const invitation = await inviteTenantMember(req.authUser!, tenantId, req.body);
    return res.status(201).json({ item: invitation });
}
