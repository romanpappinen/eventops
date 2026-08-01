import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis.js';

export interface RateLimiterOptions {
    windowMs: number;
    max: number;
    message: string;
}

/**
 * express-rate-limit's default store keeps counters in the process's own
 * memory. That falls apart the moment this API runs as more than one
 * instance (Render lets you scale a Starter-plan service to multiple
 * instances by hand, no plan change needed): each instance would enforce
 * the limit independently, so the effective limit becomes
 * `max * instanceCount` instead of `max`. Backing the store with Redis
 * makes the counter shared and atomic (`INCR`) across every instance.
 *
 * Skipped in tests: there is no Redis available in the test environment,
 * and the existing test suite already exercises the limiting behavior
 * itself against the default in-memory store (see rate-limit.test.ts).
 */
export function createRateLimiter(options: RateLimiterOptions) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        store:
            process.env.NODE_ENV === 'test'
                ? undefined
                : new RedisStore({
                      sendCommand: (command: string, ...args: string[]) =>
                          getRedisClient().call(command, ...args) as never,
                  }),
        handler: (_req, res) => {
            res.status(429).json({ error: options.message });
        },
    });
}
