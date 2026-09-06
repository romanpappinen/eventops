import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type {
    AcceptInvitationByIdInput,
    AcceptInvitationInput,
    InvitationAcceptLookup,
} from '../tenants/tenant.schemas.js';
import {
    acceptTenantInvitationByIdForUser,
    acceptTenantInvitationByTokenForUser,
    getInvitationByToken,
    getPendingInvitationForCurrentUser,
} from '../tenants/tenant.service.js';

export async function getInvitation(req: Request, res: Response) {
    const authRequest = req as AuthenticatedRequest;
    const item = await getInvitationByToken(
        authRequest.authUser!,
        req.query as InvitationAcceptLookup
    );
    return res.json({ item });
}

export async function getPendingInvitation(req: AuthenticatedRequest, res: Response) {
    const item = await getPendingInvitationForCurrentUser(req.authUser!);
    return res.json({ item });
}

export async function acceptInvitation(req: AuthenticatedRequest, res: Response) {
    const item = await acceptTenantInvitationByTokenForUser(
        req.authUser!,
        req.authToken!,
        req.body as AcceptInvitationInput
    );
    return res.status(201).json({ item });
}

export async function acceptInvitationById(req: AuthenticatedRequest, res: Response) {
    const item = await acceptTenantInvitationByIdForUser(
        req.authUser!,
        req.authToken!,
        req.body as AcceptInvitationByIdInput
    );
    return res.status(201).json({ item });
}
