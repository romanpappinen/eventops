import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';
const eventId = '660e8400-e29b-41d4-a716-446655440000';

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

function mockEventLookup(result: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eqId = vi.fn(() => ({ maybeSingle }));
    const eqTenant = vi.fn(() => ({ eq: eqId }));
    const select = vi.fn(() => ({ eq: eqTenant }));

    return { select, eqTenant, eqId };
}

describe('GET /tenants/:tenantId/events/:eventId', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get(`/tenants/${tenantId}/events/${eventId}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns 400 when the event id is not a uuid', async () => {
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

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/not-a-uuid`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request parameters',
        });
    });

    it('returns 404 when the authenticated user is not an active tenant member', async () => {
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

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership(null);
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/${eventId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Tenant not found',
        });
    });

    it('returns 404 when the event does not exist for the tenant', async () => {
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

        const eventLookup = mockEventLookup({ data: null, error: null });

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return { select: eventLookup.select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/${eventId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Event not found',
        });
    });

    it('returns the normalized event when found', async () => {
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

        const eventLookup = mockEventLookup({
            data: {
                id: eventId,
                tenant_id: tenantId,
                source: 'worker',
                type: 'invoice_synced',
                subject: 'invoice:200',
                occurred_at: '2026-05-18T12:05:00.000Z',
                received_at: '2026-05-18T12:05:01.000Z',
                payload: { invoiceId: '200' },
                metadata: { schemaVersion: 2 },
                status: 'accepted',
                created_by_user_id: 'user-123',
                idempotency_key: null,
                created_at: '2026-05-18T12:05:01.000Z',
                updated_at: '2026-05-18T12:05:01.000Z',
            },
            error: null,
        });

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return { select: eventLookup.select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/${eventId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(eventLookup.eqTenant).toHaveBeenCalledWith('tenant_id', tenantId);
        expect(eventLookup.eqId).toHaveBeenCalledWith('id', eventId);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                id: eventId,
                tenantId,
                source: 'worker',
                type: 'invoice_synced',
                subject: 'invoice:200',
                occurredAt: '2026-05-18T12:05:00.000Z',
                receivedAt: '2026-05-18T12:05:01.000Z',
                payload: { invoiceId: '200' },
                metadata: { schemaVersion: 2 },
                status: 'accepted',
                createdByUserId: 'user-123',
                createdByApiKeyId: null,
                idempotencyKey: null,
                createdAt: '2026-05-18T12:05:01.000Z',
                updatedAt: '2026-05-18T12:05:01.000Z',
            },
        });
    });

    it('returns 502 when the event read fails', async () => {
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

        const eventLookup = mockEventLookup({ data: null, error: { message: 'read failed' } });

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'events') {
                return { select: eventLookup.select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events/${eventId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: 'Failed to load event',
        });
    });
});
