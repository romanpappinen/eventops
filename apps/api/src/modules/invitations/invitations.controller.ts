import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import type { AcceptInvitationInput, InvitationAcceptLookup } from '../tenants/tenant.schemas.js';
import {
    acceptTenantInvitationByTokenForUser,
    getInvitationByToken,
} from '../tenants/tenant.service.js';

export async function getInvitation(req: Request, res: Response) {
    const authRequest = req as AuthenticatedRequest;
    const item = await getInvitationByToken(
        authRequest.authUser!,
        req.query as InvitationAcceptLookup
    );
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
