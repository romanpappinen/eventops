import rateLimit from 'express-rate-limit';

export interface RateLimiterOptions {
    windowMs: number;
    max: number;
    message: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({ error: options.message });
        },
    });
}
