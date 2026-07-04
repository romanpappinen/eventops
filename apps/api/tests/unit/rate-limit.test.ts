import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rate-limit.js';

function buildTestApp() {
    const app = express();
    const limiter = createRateLimiter({
        windowMs: 60_000,
        max: 2,
        message: 'Too many requests',
    });

    app.get('/probe', limiter, (_req, res) => {
        res.json({ ok: true });
    });

    return app;
}

describe('createRateLimiter', () => {
    it('allows requests up to the configured max and blocks the next one', async () => {
        const app = buildTestApp();

        const first = await request(app).get('/probe');
        const second = await request(app).get('/probe');
        const third = await request(app).get('/probe');

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(third.status).toBe(429);
        expect(third.body).toEqual({ error: 'Too many requests' });
    });
});
