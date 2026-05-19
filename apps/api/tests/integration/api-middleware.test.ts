import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/lib/api-error.js';
import { createApp } from '../../src/app.js';

const { getUser, listTenantsForUser } = vi.hoisted(() => ({
    getUser: vi.fn(),
    listTenantsForUser: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
    getSupabaseAdmin: vi.fn(),
}));

vi.mock('../../src/modules/tenants/tenant.service.js', async () => {
    const actual = await vi.importActual<typeof import('../../src/modules/tenants/tenant.service.js')>(
        '../../src/modules/tenants/tenant.service.js'
    );

    return {
        ...actual,
        listTenantsForUser,
    };
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('API middleware and error handling', () => {
    it('returns 400 from shared validation middleware for invalid route params', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'owner@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .get('/tenants/not-a-uuid')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request parameters',
        });
    });

    it('returns ApiError responses through the global error handler', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'owner@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        listTenantsForUser.mockRejectedValue(new ApiError(404, 'Not found'));

        const app = createApp();

        const response = await request(app)
            .get('/tenants')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Not found',
        });
    });

    it('returns 500 for unexpected thrown errors', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'owner@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        listTenantsForUser.mockRejectedValue(new Error('unexpected db state'));

        const app = createApp();

        const response = await request(app)
            .get('/tenants')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
            error: 'Internal server error',
        });
    });
});
