import type { NextFunction, Request, Response } from 'express';

type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<unknown> | unknown;

export function asyncHandler(handler: AsyncRequestHandler) {
    return function wrappedHandler(req: Request, res: Response, next: NextFunction) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}
