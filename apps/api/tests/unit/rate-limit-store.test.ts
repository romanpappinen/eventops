import { afterEach, describe, expect, it, vi } from 'vitest';

const rateLimitMock = vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next());

vi.mock('express-rate-limit', () => ({
    default: rateLimitMock,
}));

const RedisStoreMock = vi.fn();

vi.mock('rate-limit-redis', () => ({
    RedisStore: RedisStoreMock,
}));

vi.mock('../../src/lib/redis.js', () => ({
    getRedisClient: () => ({ call: vi.fn() }),
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('createRateLimiter store selection', () => {
    it('uses the default in-memory store in the test environment', async () => {
        const { createRateLimiter } = await import('../../src/middleware/rate-limit.js');

        createRateLimiter({ windowMs: 1000, max: 1, message: 'x' });

        expect(rateLimitMock).toHaveBeenCalledWith(expect.objectContaining({ store: undefined }));
        expect(RedisStoreMock).not.toHaveBeenCalled();
    });

    it('uses a Redis-backed store outside the test environment', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        try {
            const { createRateLimiter } = await import('../../src/middleware/rate-limit.js');

            createRateLimiter({ windowMs: 1000, max: 1, message: 'x' });

            expect(RedisStoreMock).toHaveBeenCalledWith(
                expect.objectContaining({ sendCommand: expect.any(Function) })
            );
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });
});
