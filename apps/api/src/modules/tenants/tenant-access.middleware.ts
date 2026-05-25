import type { NextFunction, Response } from 'express';
import { getSupabaseUser } from '../../lib/supabase.js';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';

const roleRanks = {
    member: 1,
    admin: 2,
    owner: 3,
} as const;

type TenantRole = keyof typeof roleRanks;

interface RequireTenantAccessOptions {
    minimumRole?: TenantRole;
}

export interface TenantAccessContext {
    membershipId: string;
    tenantId: string;
    role: TenantRole;
    status: string;
}

export interface TenantAuthorizedRequest extends AuthenticatedRequest {
    tenantAccess?: TenantAccessContext;
}

function hasRequiredRole(currentRole: string, minimumRole: TenantRole) {
    if (!(currentRole in roleRanks)) {
        return false;
    }

    return roleRanks[currentRole as TenantRole] >= roleRanks[minimumRole];
}

export function requireTenantAccess(options: RequireTenantAccessOptions = {}) {
    const minimumRole = options.minimumRole ?? 'member';

    return async function tenantAccessMiddleware(
        req: TenantAuthorizedRequest,
        res: Response,
        next: NextFunction
    ) {
        const tenantId = typeof req.params.tenantId === 'string' ? req.params.tenantId : '';
        const userId = req.authUser?.id;
        const authToken = req.authToken;

        if (!tenantId) {
            return res.status(400).json({ error: 'Invalid tenant id' });
        }

        if (!userId || !authToken) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const supabaseUser = getSupabaseUser(authToken);
        const { data, error } = await supabaseUser
            .from('memberships')
            .select('id, tenant_id, role, status')
            .eq('tenant_id', tenantId)
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            return res.status(502).json({ error: 'Tenant access check failed' });
        }

        if (!data) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        if (!hasRequiredRole(data.role, minimumRole)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        req.tenantAccess = {
            membershipId: data.id,
            tenantId: data.tenant_id,
            role: data.role as TenantRole,
            status: data.status,
        };

        next();
    };
}
