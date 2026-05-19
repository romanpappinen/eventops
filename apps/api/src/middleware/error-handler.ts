import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error.js';

export function errorHandler(
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    if (error instanceof ApiError) {
        return res.status(error.statusCode).json({
            error: error.message,
            ...(error.details !== undefined ? { details: error.details } : {}),
        });
    }

    if (error instanceof ZodError) {
        return res.status(400).json({
            error: 'Invalid request',
            details: error.flatten(),
        });
    }

    return res.status(500).json({
        error: 'Internal server error',
    });
}
