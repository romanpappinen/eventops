import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { cleanupLiveTestData, registerAndSignIn, uniqueEmail } from './support/live-client.js';

describe('auth against a real local Supabase stack', () => {
    const app = createApp();
    const userIds: string[] = [];

    afterAll(async () => {
        await cleanupLiveTestData({ userIds });
    });

    it('returns 401 for /auth/me without a token', async () => {
        const response = await request(app).get('/auth/me');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 for /auth/me with a garbage token', async () => {
        const response = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-real-token');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('registers a real user against GoTrue and creates a public.users row', async () => {
        const email = uniqueEmail('register');

        const response = await request(app).post('/auth/register').send({
            firstName: 'Live',
            lastName: 'Register',
            email,
            password: 'LiveTestPassword123!',
        });

        expect(response.status).toBe(201);
        expect(response.body.item).toMatchObject({
            email,
            fullName: 'Live Register',
        });
        expect(response.body.item.id).toEqual(expect.any(String));

        userIds.push(response.body.item.id);
    });

    it('rejects a duplicate registration for the same email', async () => {
        const email = uniqueEmail('dupe');

        const first = await request(app).post('/auth/register').send({
            firstName: 'Live',
            lastName: 'Dupe',
            email,
            password: 'LiveTestPassword123!',
        });
        expect(first.status).toBe(201);
        userIds.push(first.body.item.id);

        const second = await request(app).post('/auth/register').send({
            firstName: 'Live',
            lastName: 'Dupe',
            email,
            password: 'LiveTestPassword123!',
        });

        expect(second.status).toBeGreaterThanOrEqual(400);
        expect(second.status).toBeLessThan(500);
    });

    it('signs in a registered user and returns their profile from /auth/me', async () => {
        const user = await registerAndSignIn(app, { firstName: 'Live', lastName: 'Me', emailPrefix: 'me' });
        userIds.push(user.id);

        const response = await request(app).get('/auth/me').set('Authorization', `Bearer ${user.accessToken}`);

        expect(response.status).toBe(200);
        expect(response.body.item).toMatchObject({
            id: user.id,
            email: user.email,
            fullName: 'Live Me',
        });
    });
});
