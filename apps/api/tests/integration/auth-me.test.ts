import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const getUser = vi.fn();

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('GET /auth/me authorization', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get('/auth/me');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns 401 when the bearer token is invalid', async () => {
        getUser.mockResolvedValue({
            data: {
                user: null,
            },
            error: {
                message: 'Invalid token',
            },
        });

        const app = createApp();

        const response = await request(app)
            .get('/auth/me')
            .set('Authorization', 'Bearer invalid-token');

        expect(getUser).toHaveBeenCalledWith('invalid-token');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns 503 when the auth provider is unavailable', async () => {
        getUser.mockRejectedValue(new TypeError('fetch failed'));

        const app = createApp();

        const response = await request(app)
            .get('/auth/me')
            .set('Authorization', 'Bearer valid-token');

        expect(getUser).toHaveBeenCalledWith('valid-token');
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            error: 'Auth service unavailable',
        });
    });

    it('returns the authenticated user', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'user@example.com',
                    user_metadata: {
                        full_name: 'Example User',
                        avatar_url: 'https://example.com/avatar.png',
                    },
                },
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .get('/auth/me')
            .set('Authorization', 'Bearer valid-token');

        expect(getUser).toHaveBeenCalledWith('valid-token');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                id: 'user-123',
                email: 'user@example.com',
                fullName: 'Example User',
                avatarUrl: 'https://example.com/avatar.png',
            },
        });
    });
});
