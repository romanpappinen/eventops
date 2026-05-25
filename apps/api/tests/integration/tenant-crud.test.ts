import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const { getUser, rpc, ensureUserProfile, from } = vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    ensureUserProfile: vi.fn(),
    from: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
    getSupabaseUser: () => ({
        rpc,
        from,
    }),
}));

vi.mock('../../src/modules/auth/ensure-user-profile.js', () => ({
    ensureUserProfile,
}));

afterEach(() => {
    vi.clearAllMocks();
});

function mockTenantMembershipAccess(options: {
    role?: string;
    status?: string;
    membershipError?: { message: string } | null;
    membershipData?: Record<string, unknown> | null;
}) {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: options.membershipData ?? {
            id: 'membership-123',
            tenant_id: '550e8400-e29b-41d4-a716-446655440000',
            role: options.role ?? 'owner',
            status: options.status ?? 'active',
        },
        error: options.membershipError ?? null,
    });

    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqStatus }));
    const eqTenant = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqTenant }));

    from.mockImplementation((table: string) => {
        if (table === 'memberships') {
            return { select };
        }

        return {
            select: vi.fn(),
            update: vi.fn(),
        };
    });
}

describe('tenant CRUD routes', () => {
    it('returns the tenant when the authenticated member has access', async () => {
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
        mockTenantMembershipAccess({});

        const maybeSingleTenant = vi.fn().mockResolvedValue({
            data: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                name: 'Acme Ops',
                description: 'Workspace',
                slug: 'acme-ops',
                plan: 'free',
                status: 'active',
                created_at: '2026-05-17T00:00:00.000Z',
                created_by_user_id: 'user-123',
                updated_at: '2026-05-17T00:00:00.000Z',
            },
            error: null,
        });
        const eqTenantId = vi.fn(() => ({ maybeSingle: maybeSingleTenant }));
        const selectTenant = vi.fn(() => ({ eq: eqTenantId }));

        from.mockImplementation((table: string) => {
            if (table === 'memberships') {
                const maybeSingle = vi.fn().mockResolvedValue({
                    data: {
                        id: 'membership-123',
                        tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                        role: 'owner',
                        status: 'active',
                    },
                    error: null,
                });
                const eqStatus = vi.fn(() => ({ maybeSingle }));
                const eqUser = vi.fn(() => ({ eq: eqStatus }));
                const eqTenant = vi.fn(() => ({ eq: eqUser }));
                const select = vi.fn(() => ({ eq: eqTenant }));
                return { select };
            }

            if (table === 'tenants') {
                return { select: selectTenant };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get('/tenants/550e8400-e29b-41d4-a716-446655440000')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.item).toMatchObject({
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Acme Ops',
            slug: 'acme-ops',
        });
    });

    it('returns 403 when a member attempts to update a tenant', async () => {
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
        mockTenantMembershipAccess({ role: 'member' });

        const app = createApp();

        const response = await request(app)
            .patch('/tenants/550e8400-e29b-41d4-a716-446655440000')
            .set('Authorization', 'Bearer valid-token')
            .send({
                name: 'Renamed',
            });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: 'Forbidden',
        });
    });

    it('updates a tenant for an owner', async () => {
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

        const maybeSingleMembership = vi.fn().mockResolvedValue({
            data: {
                id: 'membership-123',
                tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                role: 'owner',
                status: 'active',
            },
            error: null,
        });
        const selectMembership = vi.fn(() => ({
            eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleMembership,
                    })),
                })),
            })),
        }));
        rpc.mockResolvedValue({
            data: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                name: 'Renamed Tenant',
                description: 'Updated description',
                slug: 'renamed-tenant',
                plan: 'free',
                status: 'active',
                created_at: '2026-05-17T00:00:00.000Z',
                created_by_user_id: 'user-123',
                updated_at: '2026-05-17T01:00:00.000Z',
            },
            error: null,
        });

        from.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return { select: selectMembership };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .patch('/tenants/550e8400-e29b-41d4-a716-446655440000')
            .set('Authorization', 'Bearer valid-token')
            .send({
                name: 'Renamed Tenant',
                description: 'Updated description',
                slug: 'renamed-tenant',
            });

        expect(response.status).toBe(200);
        expect(response.body.item).toMatchObject({
            name: 'Renamed Tenant',
            description: 'Updated description',
            slug: 'renamed-tenant',
        });
        expect(rpc).toHaveBeenCalledWith('update_tenant', {
            p_tenant_id: '550e8400-e29b-41d4-a716-446655440000',
            p_name: 'Renamed Tenant',
            p_slug: 'renamed-tenant',
            p_description: 'Updated description',
            p_description_provided: true,
        });
    });

    it('archives a tenant for an owner', async () => {
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

        const maybeSingleMembership = vi.fn().mockResolvedValue({
            data: {
                id: 'membership-123',
                tenant_id: '550e8400-e29b-41d4-a716-446655440000',
                role: 'owner',
                status: 'active',
            },
            error: null,
        });
        const selectMembership = vi.fn(() => ({
            eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleMembership,
                    })),
                })),
            })),
        }));
        rpc.mockResolvedValue({
            data: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                name: 'Acme Ops',
                description: 'Workspace',
                slug: 'acme-ops',
                plan: 'free',
                status: 'archived',
                created_at: '2026-05-17T00:00:00.000Z',
                created_by_user_id: 'user-123',
                updated_at: '2026-05-17T01:00:00.000Z',
            },
            error: null,
        });

        from.mockImplementation((table: string) => {
            if (table === 'memberships') {
                return { select: selectMembership };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .delete('/tenants/550e8400-e29b-41d4-a716-446655440000')
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.item.status).toBe('archived');
        expect(rpc).toHaveBeenCalledWith('archive_tenant', {
            p_tenant_id: '550e8400-e29b-41d4-a716-446655440000',
        });
    });
});
