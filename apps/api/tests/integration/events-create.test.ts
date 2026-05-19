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
    getSupabaseAdmin: vi.fn(),
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /tenants/:tenantId/events', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).post(`/tenants/${tenantId}/events`).send({
            source: 'web-app',
            type: 'order_created',
            occurredAt: '2026-05-18T12:00:00.000Z',
            payload: {
                orderId: '123',
            },
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns 400 when the tenant id is invalid', async () => {
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
            .post('/tenants/not-a-uuid/events')
            .set('Authorization', 'Bearer valid-token')
            .send({
                source: 'web-app',
                type: 'order_created',
                occurredAt: '2026-05-18T12:00:00.000Z',
                payload: {
                    orderId: '123',
                },
            });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request parameters',
        });
    });

    it('returns 400 when the create event DTO is invalid', async () => {
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
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                source: 'w',
                type: 'Order Created',
                occurredAt: 'invalid-date',
                payload: [],
            });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
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

        const single = vi.fn().mockResolvedValue({
            data: null,
            error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "events"',
            },
        });
        const select = vi.fn(() => ({ single }));
        const insert = vi.fn(() => ({ select }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { insert };
            }

            return { insert: vi.fn(), select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                source: 'web-app',
                type: 'order_created',
                occurredAt: '2026-05-18T12:00:00.000Z',
                payload: {
                    orderId: '123',
                },
            });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Tenant not found',
        });
    });

    it('creates an event for an active tenant member', async () => {
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

        const single = vi.fn().mockResolvedValue({
            data: {
                id: 'event-123',
                tenant_id: tenantId,
                source: 'web-app',
                type: 'order_created',
                subject: 'order:123',
                occurred_at: '2026-05-18T12:00:00.000Z',
                received_at: '2026-05-18T12:00:01.000Z',
                payload: {
                    orderId: '123',
                    amount: 49,
                },
                metadata: {},
                status: 'accepted',
                created_by_user_id: 'user-123',
                idempotency_key: null,
                created_at: '2026-05-18T12:00:01.000Z',
                updated_at: '2026-05-18T12:00:01.000Z',
            },
            error: null,
        });
        const select = vi.fn(() => ({ single }));
        const insert = vi.fn(() => ({ select }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { insert };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                source: 'web-app',
                type: 'order_created',
                subject: 'order:123',
                occurredAt: '2026-05-18T12:00:00.000Z',
                payload: {
                    orderId: '123',
                    amount: 49,
                },
            });

        expect(insert).toHaveBeenCalledWith({
            tenant_id: tenantId,
            source: 'web-app',
            type: 'order_created',
            subject: 'order:123',
            occurred_at: '2026-05-18T12:00:00.000Z',
            payload: {
                orderId: '123',
                amount: 49,
            },
            metadata: {},
            created_by_user_id: 'user-123',
        });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'event-123',
                tenantId,
                source: 'web-app',
                type: 'order_created',
                subject: 'order:123',
                occurredAt: '2026-05-18T12:00:00.000Z',
                receivedAt: '2026-05-18T12:00:01.000Z',
                payload: {
                    orderId: '123',
                    amount: 49,
                },
                metadata: {},
                status: 'accepted',
                createdByUserId: 'user-123',
                idempotencyKey: null,
                createdAt: '2026-05-18T12:00:01.000Z',
                updatedAt: '2026-05-18T12:00:01.000Z',
            },
        });
    });

    it('returns 502 when the event insert fails', async () => {
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

        const single = vi.fn().mockResolvedValue({
            data: null,
            error: {
                message: 'insert failed',
            },
        });
        const select = vi.fn(() => ({ single }));
        const insert = vi.fn(() => ({ select }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { insert };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                source: 'web-app',
                type: 'order_created',
                occurredAt: '2026-05-18T12:00:00.000Z',
                payload: {
                    orderId: '123',
                },
            });

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: 'Event creation is temporarily unavailable',
        });
    });
});
