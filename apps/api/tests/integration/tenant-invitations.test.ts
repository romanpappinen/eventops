import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';

const { getUser, rpc, from } = vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
}));

vi.mock('../../src/lib/supabase.js', () => ({
    getSupabaseAuth: () => ({
        auth: {
            getUser,
        },
    }),
    getSupabaseAdmin: () => ({
        rpc,
        from,
    }),
}));

afterEach(() => {
    vi.clearAllMocks();
});

function mockTenantAccess(role = 'owner') {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'membership-123',
            tenant_id: tenantId,
            role,
            status: 'active',
        },
        error: null,
    });
    const eqStatus = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqStatus }));
    const eqTenant = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqTenant }));

    from.mockImplementation((table: string) => {
        if (table === 'memberships') {
            return { select };
        }

        return { select: vi.fn() };
    });
}

describe('POST /tenants/:tenantId/invitations', () => {
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
        mockTenantAccess();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                email: 'not-an-email',
            });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
            error: 'Invalid request',
        });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('creates a pending invitation for an owner', async () => {
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
        mockTenantAccess();
        rpc.mockResolvedValue({
            data: {
                id: 'invite-123',
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'admin',
                status: 'pending',
                invited_by_user_id: 'user-123',
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                email: 'Member@example.com',
                role: 'admin',
            });

        expect(rpc).toHaveBeenCalledWith('create_tenant_invitation', {
            p_tenant_id: tenantId,
            p_email: 'member@example.com',
            p_role: 'admin',
            p_invited_by_user_id: 'user-123',
        });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'invite-123',
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'admin',
                status: 'pending',
                invited_by_user_id: 'user-123',
            },
        });
    });

    it('returns 403 when the requester is not a tenant owner', async () => {
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
        mockTenantAccess('member');

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                email: 'member@example.com',
            });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: 'Forbidden',
        });
    });
});
