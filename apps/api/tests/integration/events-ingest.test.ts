import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { hashApiKey } from '../../src/modules/api-keys/api-keys.types.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';
const apiKeyId = '660e8400-e29b-41d4-a716-446655440000';
const rawKey = 'eo_live_test-raw-key';

const { adminFrom } = vi.hoisted(() => ({
    adminFrom: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAdmin: () => ({
        from: adminFrom,
    }),
}));

afterEach(() => {
    vi.clearAllMocks();
});

function mockApiKeyLookup(row: { id: string; tenant_id: string; revoked_at: string | null } | null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));

    return { select };
}

function mockApiKeyUpdate() {
    const eq = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const update = vi.fn(() => ({ eq }));

    return { update };
}

function mockTenantStatus(status: 'active' | 'archived' = 'active') {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { status }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));

    return { select };
}

function mockEventQuota(count = 0) {
    const gte = vi.fn().mockResolvedValue({ count, error: null });
    const eq = vi.fn(() => ({ gte }));
    const select = vi.fn(() => ({ eq }));

    return { select };
}

const validBody = {
    source: 'external-backend',
    type: 'order_created',
    occurredAt: '2026-07-14T12:00:00.000Z',
    payload: { orderId: '123' },
};

describe('POST /events (API key ingestion)', () => {
    it('returns 401 with no bearer token', async () => {
        const app = createApp();

        const response = await request(app).post('/events').send(validBody);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 for an unknown key', async () => {
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return mockApiKeyLookup(null);
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send(validBody);

        expect(response.status).toBe(401);
    });

    it('returns 401 for a revoked key', async () => {
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                return mockApiKeyLookup({
                    id: apiKeyId,
                    tenant_id: tenantId,
                    revoked_at: '2026-07-14T00:00:00.000Z',
                });
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send(validBody);

        expect(response.status).toBe(401);
    });

    it('creates an event attributed to the API key, with tenant resolved from the key alone', async () => {
        const single = vi.fn().mockResolvedValue({
            data: {
                id: 'event-123',
                tenant_id: tenantId,
                source: 'external-backend',
                type: 'order_created',
                subject: null,
                occurred_at: '2026-07-14T12:00:00.000Z',
                received_at: '2026-07-14T12:00:01.000Z',
                payload: { orderId: '123' },
                metadata: {},
                status: 'accepted',
                created_by_user_id: null,
                created_by_api_key_id: apiKeyId,
                idempotency_key: null,
                created_at: '2026-07-14T12:00:01.000Z',
                updated_at: '2026-07-14T12:00:01.000Z',
            },
            error: null,
        });
        const insertSelect = vi.fn(() => ({ single }));
        const insert = vi.fn((_row: Record<string, unknown>) => ({ select: insertSelect }));

        let apiKeysCallCount = 0;
        let eventsCallCount = 0;
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                apiKeysCallCount += 1;
                return apiKeysCallCount === 1
                    ? mockApiKeyLookup({ id: apiKeyId, tenant_id: tenantId, revoked_at: null })
                    : mockApiKeyUpdate();
            }

            if (table === 'tenants') {
                return mockTenantStatus();
            }

            if (table === 'events') {
                eventsCallCount += 1;
                return eventsCallCount === 1 ? mockEventQuota() : { insert };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send(validBody);

        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                tenant_id: tenantId,
                created_by_api_key_id: apiKeyId,
            })
        );
        expect(insert.mock.calls[0][0]).not.toHaveProperty('created_by_user_id');
        expect(response.status).toBe(201);
        expect(response.body.item.createdByApiKeyId).toBe(apiKeyId);
        expect(response.body.item.createdByUserId).toBeNull();
    });

    it('rejects a tenantId in the body -- tenant comes only from the key, never from client input', async () => {
        const otherTenantId = '770e8400-e29b-41d4-a716-446655440000';

        let apiKeysCallCount = 0;
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                apiKeysCallCount += 1;
                return apiKeysCallCount === 1
                    ? mockApiKeyLookup({ id: apiKeyId, tenant_id: tenantId, revoked_at: null })
                    : mockApiKeyUpdate();
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send({ ...validBody, tenantId: otherTenantId });

        expect(response.status).toBe(400);
    });

    it('returns 409 when the tenant is archived', async () => {
        let apiKeysCallCount = 0;
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                apiKeysCallCount += 1;
                return apiKeysCallCount === 1
                    ? mockApiKeyLookup({ id: apiKeyId, tenant_id: tenantId, revoked_at: null })
                    : mockApiKeyUpdate();
            }

            if (table === 'tenants') {
                return mockTenantStatus('archived');
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send(validBody);

        expect(response.status).toBe(409);
    });

    it('returns 429 when the tenant has reached its daily event quota', async () => {
        const insert = vi.fn();
        let apiKeysCallCount = 0;
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                apiKeysCallCount += 1;
                return apiKeysCallCount === 1
                    ? mockApiKeyLookup({ id: apiKeyId, tenant_id: tenantId, revoked_at: null })
                    : mockApiKeyUpdate();
            }

            if (table === 'tenants') {
                return mockTenantStatus();
            }

            if (table === 'events') {
                return { ...mockEventQuota(10000), insert };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send(validBody);

        expect(insert).not.toHaveBeenCalled();
        expect(response.status).toBe(429);
    });

    it('replays the existing event with 200 on a duplicate idempotency key', async () => {
        const existingEvent = {
            id: 'event-existing',
            tenant_id: tenantId,
            source: 'external-backend',
            type: 'order_created',
            occurred_at: '2026-07-14T12:00:00.000Z',
            payload: { orderId: '123' },
            metadata: {},
            status: 'accepted',
            created_by_api_key_id: apiKeyId,
            idempotency_key: 'retry-key-1',
            created_at: '2026-07-14T12:00:01.000Z',
            updated_at: '2026-07-14T12:00:01.000Z',
        };

        const single = vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        });
        const insertSelect = vi.fn(() => ({ single }));
        const insert = vi.fn(() => ({ select: insertSelect }));

        const maybeSingle = vi.fn().mockResolvedValue({ data: existingEvent, error: null });
        const eqIdempotencyKey = vi.fn(() => ({ maybeSingle }));
        const eqTenant = vi.fn(() => ({ eq: eqIdempotencyKey }));
        const lookupSelect = vi.fn(() => ({ eq: eqTenant }));

        let apiKeysCallCount = 0;
        let eventsCallCount = 0;
        adminFrom.mockImplementation((table: string) => {
            if (table === 'api_keys') {
                apiKeysCallCount += 1;
                return apiKeysCallCount === 1
                    ? mockApiKeyLookup({ id: apiKeyId, tenant_id: tenantId, revoked_at: null })
                    : mockApiKeyUpdate();
            }

            if (table === 'tenants') {
                return mockTenantStatus();
            }

            if (table === 'events') {
                eventsCallCount += 1;

                if (eventsCallCount === 1) {
                    return mockEventQuota();
                }

                return eventsCallCount === 2 ? { insert, select: lookupSelect } : { select: lookupSelect };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post('/events')
            .set('Authorization', `Bearer ${rawKey}`)
            .send({ ...validBody, idempotencyKey: 'retry-key-1' });

        expect(response.status).toBe(200);
        expect(response.body.item.id).toBe('event-existing');
    });
});

describe('hashApiKey', () => {
    it('is deterministic', () => {
        expect(hashApiKey(rawKey)).toBe(hashApiKey(rawKey));
        expect(hashApiKey(rawKey)).not.toBe(rawKey);
    });
});
