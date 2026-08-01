import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';

const { getUser, userFrom } = vi.hoisted(() => ({
    getUser: vi.fn(),
    userFrom: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
    getSupabaseUser: () => ({
        from: userFrom,
    }),
}));

afterEach(() => {
    vi.clearAllMocks();
});

function mockMembership(options?: { role?: string; status?: string } | null) {
    const maybeSingle = vi.fn().mockResolvedValue({
        data:
            options === null
                ? null
                : {
                      id: 'membership-123',
                      tenant_id: tenantId,
                      role: options?.role ?? 'member',
                      status: options?.status ?? 'active',
                  },
        error: null,
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqStatus }));
    const eqTenant = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqTenant }));

    return { select };
}

function mockEventsCounts(
    results: Record<string, { count: number | null; error: { message: string } | null }>
) {
    const select = vi.fn(() => {
        const eqStatus = vi.fn((_column: string, status: string) => {
            const gte = vi.fn().mockResolvedValue(results[status] ?? { count: 0, error: null });
            return { gte };
        });
        const eqTenant = vi.fn(() => ({ eq: eqStatus }));

        return { eq: eqTenant };
    });

    return { select };
}

function authenticateAsMember() {
    getUser.mockResolvedValue({
        data: {
            user: {
                id: 'user-123',
                email: 'member@example.com',
                user_metadata: {},
            },
        },
        error: null,
    });
}

describe('GET /tenants/:tenantId/events/stats', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get(`/tenants/${tenantId}/events/stats`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns 400 when the tenant id is invalid', async () => {
        authenticateAsMember();

        const app = createApp();

        const response = await request(app)
            .get('/tenants/not-a-uuid/events/stats')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request parameters',
        });
    });

    it('returns 400 when windowDays is out of range', async () => {
        authenticateAsMember();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/stats?windowDays=0`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
        });
    });

    it('returns 404 when the authenticated user is not an active tenant member', async () => {
        authenticateAsMember();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership(null);
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/stats`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Tenant not found',
        });
    });

    it('returns summed counts for an active member, defaulting to a 7-day window', async () => {
        authenticateAsMember();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return mockEventsCounts({
                    accepted: { count: 2, error: null },
                    processed: { count: 5, error: null },
                    failed: { count: 1, error: null },
                });
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/stats`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                windowDays: 7,
                total: 8,
                accepted: 2,
                processed: 5,
                failed: 1,
            },
        });
    });

    it('honors an explicit windowDays value', async () => {
        authenticateAsMember();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return mockEventsCounts({
                    accepted: { count: 0, error: null },
                    processed: { count: 3, error: null },
                    failed: { count: 0, error: null },
                });
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/stats?windowDays=30`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                windowDays: 30,
                total: 3,
                accepted: 0,
                processed: 3,
                failed: 0,
            },
        });
    });

    it('returns 502 when a count query fails', async () => {
        authenticateAsMember();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return mockEventsCounts({
                    accepted: { count: 2, error: null },
                    processed: { count: null, error: { message: 'read failed' } },
                    failed: { count: 1, error: null },
                });
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/stats`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: 'Failed to load event stats',
        });
    });
});
