import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';
const apiKeyId = '660e8400-e29b-41d4-a716-446655440000';

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
                      role: options?.role ?? 'owner',
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

function authenticateAsMember() {
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
}

describe('POST /tenants/:tenantId/api-keys', () => {
    it('returns 401 with no bearer token', async () => {
        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .send({ name: 'Production backend' });

        expect(response.status).toBe(401);
    });

    it('returns 403 when the caller is not the tenant owner', async () => {
        authenticateAsMember();
        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership({ role: 'member' });
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', 'Bearer valid-token')
            .send({ name: 'Production backend' });

        expect(response.status).toBe(403);
    });

    it('creates a key and returns the raw secret once, never the hash', async () => {
        authenticateAsMember();

        const single = vi.fn().mockResolvedValue({
            data: {
                id: apiKeyId,
                tenant_id: tenantId,
                name: 'Production backend',
                key_prefix: 'eo_live_abcdefghij',
                created_at: '2026-07-14T00:00:00.000Z',
                last_used_at: null,
                revoked_at: null,
            },
            error: null,
        });
        const select = vi.fn(() => ({ single }));
        const insert = vi.fn((_row: Record<string, unknown>) => ({ select }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'api_keys') {
                return { insert };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', 'Bearer valid-token')
            .send({ name: 'Production backend' });

        expect(response.status).toBe(201);
        expect(response.body.item.rawKey).toMatch(/^eo_live_/);
        expect(response.body.item).not.toHaveProperty('keyHash');
        expect(response.body.item).not.toHaveProperty('key_hash');
        expect(response.body.item).toMatchObject({
            id: apiKeyId,
            tenantId,
            name: 'Production backend',
            keyPrefix: 'eo_live_abcdefghij',
        });

        const insertedRow = insert.mock.calls[0][0];
        expect(insertedRow.key_hash).toBeTypeOf('string');
        expect(insertedRow.key_hash).not.toBe(response.body.item.rawKey);
    });

    it('returns 400 when the name is missing', async () => {
        authenticateAsMember();
        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', 'Bearer valid-token')
            .send({});

        expect(response.status).toBe(400);
    });
});

describe('GET /tenants/:tenantId/api-keys', () => {
    it('never returns key_hash to the client', async () => {
        authenticateAsMember();

        const order = vi.fn().mockResolvedValue({
            data: [
                {
                    id: apiKeyId,
                    tenant_id: tenantId,
                    name: 'Production backend',
                    key_prefix: 'eo_live_abcdefghij',
                    created_at: '2026-07-14T00:00:00.000Z',
                    last_used_at: null,
                    revoked_at: null,
                },
            ],
            error: null,
        });
        const eq = vi.fn(() => ({ order }));
        const select = vi.fn(() => ({ eq }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'api_keys') {
                return { select };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        expect(select).toHaveBeenCalledTimes(0);

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/api-keys`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(select).toHaveBeenCalledWith(
            'id, tenant_id, name, key_prefix, created_at, last_used_at, revoked_at'
        );
        expect(response.body.items[0]).not.toHaveProperty('keyHash');
    });
});

describe('DELETE /tenants/:tenantId/api-keys/:apiKeyId', () => {
    it('returns 404 when the key does not belong to the tenant', async () => {
        authenticateAsMember();

        const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const eqId = vi.fn(() => ({ maybeSingle }));
        const eqTenant = vi.fn(() => ({ eq: eqId }));
        const select = vi.fn(() => ({ eq: eqTenant }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'api_keys') {
                return { select };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .delete(`/tenants/${tenantId}/api-keys/${apiKeyId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
    });

    it('revokes an active key', async () => {
        authenticateAsMember();

        const existingRow = {
            id: apiKeyId,
            tenant_id: tenantId,
            name: 'Production backend',
            key_prefix: 'eo_live_abcdefghij',
            created_at: '2026-07-14T00:00:00.000Z',
            last_used_at: null,
            revoked_at: null,
        };
        const findMaybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
        const findEqId = vi.fn(() => ({ maybeSingle: findMaybeSingle }));
        const findEqTenant = vi.fn(() => ({ eq: findEqId }));
        const findSelect = vi.fn(() => ({ eq: findEqTenant }));

        const updateSingle = vi.fn().mockResolvedValue({
            data: { ...existingRow, revoked_at: '2026-07-14T01:00:00.000Z' },
            error: null,
        });
        const updateSelect = vi.fn(() => ({ single: updateSingle }));
        const updateEqId = vi.fn(() => ({ select: updateSelect }));
        const updateEqTenant = vi.fn(() => ({ eq: updateEqId }));
        const update = vi.fn(() => ({ eq: updateEqTenant }));

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'api_keys') {
                return { select: findSelect, update };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .delete(`/tenants/${tenantId}/api-keys/${apiKeyId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.item.revokedAt).toBe('2026-07-14T01:00:00.000Z');
    });

    it('is idempotent when the key is already revoked', async () => {
        authenticateAsMember();

        const existingRow = {
            id: apiKeyId,
            tenant_id: tenantId,
            name: 'Production backend',
            key_prefix: 'eo_live_abcdefghij',
            created_at: '2026-07-14T00:00:00.000Z',
            last_used_at: null,
            revoked_at: '2026-07-14T01:00:00.000Z',
        };
        const findMaybeSingle = vi.fn().mockResolvedValue({ data: existingRow, error: null });
        const findEqId = vi.fn(() => ({ maybeSingle: findMaybeSingle }));
        const findEqTenant = vi.fn(() => ({ eq: findEqId }));
        const findSelect = vi.fn(() => ({ eq: findEqTenant }));
        const update = vi.fn();

        userFrom.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return mockMembership();
            }

            if (table === 'api_keys') {
                return { select: findSelect, update };
            }

            return { select: vi.fn(), insert: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .delete(`/tenants/${tenantId}/api-keys/${apiKeyId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(update).not.toHaveBeenCalled();
        expect(response.status).toBe(200);
        expect(response.body.item.revokedAt).toBe('2026-07-14T01:00:00.000Z');
    });
});
