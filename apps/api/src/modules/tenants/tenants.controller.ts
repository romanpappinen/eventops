import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type {
    TenantInvitationRouteParams,
    TenantParams,
} from './tenant.schemas.js';
import {
    archiveTenantForUser,
    createTenantForUser,
    getTenantByIdForUser,
    inviteTenantMember,
    listTenantInvitationsForOwner,
    listTenantsForUser,
    revokeTenantInvitationForOwner,
    updateTenantForUser,
} from './tenant.service.js';
import type { TenantAuthorizedRequest } from './tenant-access.middleware.js';

export async function listTenants(req: AuthenticatedRequest, res: Response) {
    const items = await listTenantsForUser(req.authToken!, req.authUser!.id);
    return res.json({ items });
}

export async function createTenant(req: AuthenticatedRequest, res: Response) {
    const tenant = await createTenantForUser(req.authUser!, req.authToken!, req.body);
    return res.status(201).json({ item: tenant });
}

export async function getTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await getTenantByIdForUser(req.authToken!, req.authUser!.id, tenantId);
    return res.json({ item: tenant });
}

export async function updateTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await updateTenantForUser(req.authToken!, tenantId, req.body);
    return res.json({ item: tenant });
}

export async function archiveTenant(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const tenant = await archiveTenantForUser(req.authToken!, tenantId);
    return res.json({ item: tenant });
}

export async function createTenantInvitation(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const invitation = await inviteTenantMember(req.authUser!, req.authToken!, tenantId, req.body);
    return res.status(201).json({ item: invitation });
}

export async function listTenantInvitations(req: TenantAuthorizedRequest, res: Response) {
    const { tenantId } = req.params as TenantParams;
    const items = await listTenantInvitationsForOwner(req.authToken!, tenantId);
    return res.json({ items });
}

export async function revokeTenantInvitation(req: TenantAuthorizedRequest, res: Response) {
    const params = req.params as TenantInvitationRouteParams;
    const invitation = await revokeTenantInvitationForOwner(req.authToken!, params);
    return res.json({ item: invitation });
}
