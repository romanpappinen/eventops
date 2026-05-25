import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject, ZodType } from 'zod';
import { ApiError } from '../lib/api-error.js';

type ValidationTarget = 'body' | 'params' | 'query';

export function validate<TSchema extends ZodType | AnyZodObject>(
    schema: TSchema,
    target: ValidationTarget
) {
    return function validateRequest(req: Request, _res: Response, next: NextFunction) {
        const parsed = schema.safeParse(req[target]);

        if (!parsed.success) {
            next(new ApiError(400, target === 'params' ? 'Invalid request parameters' : 'Invalid request', parsed.error.flatten()));
            return;
        }

        if (target === 'query') {
            Object.keys(req.query).forEach((key) => {
                delete req.query[key];
            });
            Object.assign(req.query, parsed.data);
            next();
            return;
        }

        req[target] = parsed.data;
        next();
    };
}
