import type { NextFunction, Request, Response } from 'express';
import { getSupabaseAuth } from '../lib/supabase.js';

export interface AuthenticatedRequest extends Request {
    authUser?: {
        id: string;
        email?: string;
        fullName?: string | null;
        avatarUrl?: string | null;
    };
}

export async function requireAuth(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const supabaseAuth = getSupabaseAuth();

    try {
        const { data, error } = await supabaseAuth.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        req.authUser = {
            id: data.user.id,
            email: data.user.email,
            fullName:
                typeof data.user.user_metadata?.full_name === 'string'
                    ? data.user.user_metadata.full_name
                    : null,
            avatarUrl:
                typeof data.user.user_metadata?.avatar_url === 'string'
                    ? data.user.user_metadata.avatar_url
                    : null,
        };

        next();
    } catch {
        return res.status(503).json({ error: 'Auth service unavailable' });
    }
}
