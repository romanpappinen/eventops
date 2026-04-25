import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('health endpoints', () => {
    it.each(['/health', '/ready', '/live'])('returns 200 and service status for %s', async (path) => {
        const app = createApp();

        const response = await request(app).get(path);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'ok',
            service: 'api',
        });
    });
});
