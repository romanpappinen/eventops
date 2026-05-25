import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const { getUser, rpc, ensureUserProfile } = vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    ensureUserProfile: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
    getSupabaseUser: () => ({
        rpc,
        from: vi.fn(),
    }),
}));

vi.mock('../../src/modules/auth/ensure-user-profile.js', () => ({
    ensureUserProfile,
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('POST /tenants', () => {
    it('returns 400 when the payload is invalid', async () => {
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
            .post('/tenants')
            .set('Authorization', 'Bearer valid-token')
            .send({
                name: 'A',
                description: 'x'.repeat(501),
            });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
        });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('creates a tenant and assigns the creator as owner', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-123',
                    email: 'owner@example.com',
                    user_metadata: {
                        full_name: 'Owner User',
                    },
                },
            },
            error: null,
        });
        rpc.mockResolvedValue({
            data: {
                id: 'tenant-123',
                name: 'Acme Ops',
                description: 'Operations workspace',
                slug: 'acme-ops',
                plan: 'free',
                status: 'active',
                created_by_user_id: 'user-123',
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .post('/tenants')
            .set('Authorization', 'Bearer valid-token')
            .send({
                name: 'Acme Ops',
                description: 'Operations workspace',
            });

        expect(ensureUserProfile).toHaveBeenCalledWith('valid-token', {
            id: 'user-123',
            email: 'owner@example.com',
            fullName: 'Owner User',
            avatarUrl: null,
        });
        expect(rpc).toHaveBeenCalledWith('create_tenant_with_owner', {
            p_name: 'Acme Ops',
            p_slug: 'acme-ops',
            p_description: 'Operations workspace',
        });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'tenant-123',
                name: 'Acme Ops',
                description: 'Operations workspace',
                slug: 'acme-ops',
                plan: 'free',
                status: 'active',
                created_by_user_id: 'user-123',
            },
        });
    });

    it('returns 409 when the slug already exists', async () => {
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
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'duplicate key value violates unique constraint "tenants_slug_key"',
            },
        });

        const app = createApp();

        const response = await request(app)
            .post('/tenants')
            .set('Authorization', 'Bearer valid-token')
            .send({
                name: 'Acme Ops',
                slug: 'acme-ops',
            });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Tenant slug already exists',
        });
    });
});
