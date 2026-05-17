import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import {
    createTenantSchema,
    inviteTenantMemberSchema,
    tenantParamsSchema,
    updateTenantSchema,
} from './tenant.schemas.js';
import {
    archiveTenantForUser,
    createTenantForUser,
    getTenantByIdForUser,
    getTenantErrorStatus,
    inviteTenantMember,
    listTenantsForUser,
    updateTenantForUser,
} from './tenant.service.js';
import type { TenantAuthorizedRequest } from './tenant-access.middleware.js';

export async function listTenants(req: AuthenticatedRequest, res: Response) {
    try {
        const items = await listTenantsForUser(req.authUser!.id);
        return res.json({ items });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Failed to load tenants',
        });
    }
}

export async function createTenant(req: AuthenticatedRequest, res: Response) {
    const parsed = createTenantSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request',
            details: parsed.error.flatten(),
        });
    }

    try {
        const tenant = await createTenantForUser(req.authUser!, parsed.data);
        return res.status(201).json({ item: tenant });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Tenant creation failed',
        });
    }
}

export async function getTenant(req: TenantAuthorizedRequest, res: Response) {
    const parsedParams = tenantParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
        return res.status(400).json({
            error: 'Invalid tenant id',
            details: parsedParams.error.flatten(),
        });
    }

    try {
        const tenant = await getTenantByIdForUser(req.authUser!.id, parsedParams.data.tenantId);
        return res.json({ item: tenant });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Failed to load tenant',
        });
    }
}

export async function updateTenant(req: TenantAuthorizedRequest, res: Response) {
    const parsedParams = tenantParamsSchema.safeParse(req.params);
    const parsedBody = updateTenantSchema.safeParse(req.body);

    if (!parsedParams.success) {
        return res.status(400).json({
            error: 'Invalid tenant id',
            details: parsedParams.error.flatten(),
        });
    }

    if (!parsedBody.success) {
        return res.status(400).json({
            error: 'Invalid request',
            details: parsedBody.error.flatten(),
        });
    }

    try {
        const tenant = await updateTenantForUser(
            req.authUser!.id,
            parsedParams.data.tenantId,
            parsedBody.data
        );
        return res.json({ item: tenant });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Tenant update failed',
        });
    }
}

export async function archiveTenant(req: TenantAuthorizedRequest, res: Response) {
    const parsedParams = tenantParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
        return res.status(400).json({
            error: 'Invalid tenant id',
            details: parsedParams.error.flatten(),
        });
    }

    try {
        const tenant = await archiveTenantForUser(req.authUser!.id, parsedParams.data.tenantId);
        return res.json({ item: tenant });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Tenant archive failed',
        });
    }
}

export async function createTenantInvitation(req: TenantAuthorizedRequest, res: Response) {
    const parsedParams = tenantParamsSchema.safeParse(req.params);
    const parsedBody = inviteTenantMemberSchema.safeParse(req.body);

    if (!parsedParams.success) {
        return res.status(400).json({
            error: 'Invalid tenant id',
            details: parsedParams.error.flatten(),
        });
    }

    if (!parsedBody.success) {
        return res.status(400).json({
            error: 'Invalid request',
            details: parsedBody.error.flatten(),
        });
    }

    try {
        const invitation = await inviteTenantMember(
            req.authUser!,
            parsedParams.data.tenantId,
            parsedBody.data
        );
        return res.status(201).json({ item: invitation });
    } catch (error) {
        return res.status(getTenantErrorStatus(error)).json({
            error: error instanceof Error ? error.message : 'Tenant invitation failed',
        });
    }
}
