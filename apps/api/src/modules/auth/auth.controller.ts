import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { getCurrentUser, registerUser } from './auth.service.js';

export function getMe(req: AuthenticatedRequest, res: Response) {
    return res.json({
        item: getCurrentUser(req.authUser!),
    });
}

export async function register(req: Request, res: Response) {
    const result = await registerUser(req.body);
    return res.status(201).json(result);
}
