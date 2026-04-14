import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

describe('GET /tenants authorization', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get('/tenants');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });
});

describe('POST /tenants authorization', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).post('/tenants').send({
            name: 'Roman',
            slug: 'Roman',
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });
});
