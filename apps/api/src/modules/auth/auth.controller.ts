import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/require-auth.js';
import { registerSchema } from './auth.schemas.js';
import { getCurrentUser, registerUser } from './auth.service.js';

export function getMe(req: AuthenticatedRequest, res: Response) {
    return res.json({
        item: getCurrentUser(req.authUser!),
    });
}

export async function register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Invalid request',
            details: parsed.error.flatten(),
        });
    }

    try {
        const result = await registerUser(parsed.data);
        return res.status(201).json(result);
    } catch (error) {
        const statusCode =
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
                ? error.statusCode
                : 500;

        return res.status(statusCode).json({
            error: error instanceof Error ? error.message : 'Registration failed',
        });
    }
}
