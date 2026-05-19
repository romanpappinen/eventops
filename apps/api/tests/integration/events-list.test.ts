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

describe('GET /tenants/:tenantId/events', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get(`/tenants/${tenantId}/events`);

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
            .get('/tenants/not-a-uuid/events')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request parameters',
        });
    });

    it('returns 400 when the query is invalid', async () => {
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
            .get(`/tenants/${tenantId}/events?limit=0`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
        });
    });

    it('returns an empty list when no visible events are found', async () => {
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

        const limit = vi.fn().mockResolvedValue({
            data: [],
            error: null,
        });
        const order = vi.fn(() => ({ limit }));
        const eq = vi.fn(() => ({ order }));
        const select = vi.fn(() => ({ eq }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token');

        expect(limit).toHaveBeenCalledWith(20);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [],
        });
    });

    it('returns normalized events in newest-first order and applies the limit', async () => {
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

        const limit = vi.fn().mockResolvedValue({
            data: [
                {
                    id: 'event-200',
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
                {
                    id: 'event-100',
                    tenant_id: tenantId,
                    source: 'web-app',
                    type: 'order_created',
                    subject: 'order:100',
                    occurred_at: '2026-05-18T12:00:00.000Z',
                    received_at: '2026-05-18T12:00:01.000Z',
                    payload: { orderId: '100' },
                    metadata: {},
                    status: 'accepted',
                    created_by_user_id: 'user-123',
                    idempotency_key: null,
                    created_at: '2026-05-18T12:00:01.000Z',
                    updated_at: '2026-05-18T12:00:01.000Z',
                },
            ],
            error: null,
        });
        const order = vi.fn(() => ({ limit }));
        const eq = vi.fn(() => ({ order }));
        const select = vi.fn(() => ({ eq }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events?limit=2`)
            .set('Authorization', 'Bearer valid-token');

        expect(eq).toHaveBeenCalledWith('tenant_id', tenantId);
        expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
        expect(limit).toHaveBeenCalledWith(2);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [
                {
                    id: 'event-200',
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
                    idempotencyKey: null,
                    createdAt: '2026-05-18T12:05:01.000Z',
                    updatedAt: '2026-05-18T12:05:01.000Z',
                },
                {
                    id: 'event-100',
                    tenantId,
                    source: 'web-app',
                    type: 'order_created',
                    subject: 'order:100',
                    occurredAt: '2026-05-18T12:00:00.000Z',
                    receivedAt: '2026-05-18T12:00:01.000Z',
                    payload: { orderId: '100' },
                    metadata: {},
                    status: 'accepted',
                    createdByUserId: 'user-123',
                    idempotencyKey: null,
                    createdAt: '2026-05-18T12:00:01.000Z',
                    updatedAt: '2026-05-18T12:00:01.000Z',
                },
            ],
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

        const limit = vi.fn().mockResolvedValue({
            data: null,
            error: {
                message: 'read failed',
            },
        });
        const order = vi.fn(() => ({ limit }));
        const eq = vi.fn(() => ({ order }));
        const select = vi.fn(() => ({ eq }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'events') {
                return { select };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/events`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(502);
        expect(response.body).toEqual({
            error: 'Failed to load events',
        });
    });
});
