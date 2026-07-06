import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const tenantId = '550e8400-e29b-41d4-a716-446655440000';
const invitationId = '550e8400-e29b-41d4-a716-446655440001';

const { getUser, rpc, from, adminFrom, ensureUserProfile } = vi.hoisted(() => ({
    getUser: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn(),
    adminFrom: vi.fn(),
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
        from,
    }),
    getSupabaseAdmin: () => ({
        from: adminFrom,
    }),
}));

vi.mock('../../src/modules/auth/ensure-user-profile.js', () => ({
    ensureUserProfile,
}));

afterEach(() => {
    vi.clearAllMocks();
});

function mockInvitationEmailJobQueue() {
    const upsert = vi.fn().mockResolvedValue({
        error: null,
    });

    adminFrom.mockImplementation((table: string) => {
        if (table === 'invitation_email_jobs') {
            return { upsert };
        }

        if (table === 'tenant_invitations') {
            return { update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
        }

        return { upsert: vi.fn(), update: vi.fn() };
    });

    return { upsert };
}

function mockResendFlow(options?: {
    role?: string;
    tenant?: Record<string, unknown> | null;
    invitation?: Record<string, unknown> | null;
}) {
    const membershipMaybeSingle = vi.fn().mockResolvedValue({
        data: {
            id: 'membership-123',
            tenant_id: tenantId,
            role: options?.role ?? 'owner',
            status: 'active',
        },
        error: null,
    });
    const membershipEqStatus = vi.fn(() => ({ maybeSingle: membershipMaybeSingle }));
    const membershipEqUser = vi.fn(() => ({ eq: membershipEqStatus }));
    const membershipEqTenant = vi.fn(() => ({ eq: membershipEqUser }));
    const membershipSelect = vi.fn(() => ({ eq: membershipEqTenant }));

    const tenantMaybeSingle = vi.fn().mockResolvedValue({
        data: options?.tenant ?? { id: tenantId, status: 'active' },
        error: null,
    });
    const tenantEq = vi.fn(() => ({ maybeSingle: tenantMaybeSingle }));
    const tenantSelect = vi.fn(() => ({ eq: tenantEq }));

    const invitationMaybeSingle = vi.fn().mockResolvedValue({
        data:
            options && 'invitation' in options
                ? options.invitation
                : {
                    id: invitationId,
                    tenant_id: tenantId,
                    email: 'member@example.com',
                    role: 'member',
                    status: 'pending',
                    invited_by_user_id: 'user-123',
                    email_delivery_status: 'failed',
                    email_sent_at: null,
                    email_message_id: null,
                    email_delivery_error: 'boom',
                    delivery_attempts: 5,
                    accept_token_expires_at: '2026-06-01T00:00:00.000Z',
                },
        error: null,
    });
    const invitationEqTenant = vi.fn(() => ({ maybeSingle: invitationMaybeSingle }));
    const invitationEqId = vi.fn(() => ({ eq: invitationEqTenant }));
    const invitationSelect = vi.fn(() => ({ eq: invitationEqId }));

    from.mockImplementation((table: string) => {
        if (table === 'memberships') {
            return { select: membershipSelect };
        }

        if (table === 'tenants') {
            return { select: tenantSelect };
        }

        if (table === 'tenant_invitations') {
            return { select: invitationSelect };
        }

        return { select: vi.fn() };
    });
}

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
        mockInvitationEmailJobQueue();

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

    it('returns 409 when the tenant is archived', async () => {
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
        mockInvitationEmailJobQueue();
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'Archived tenants cannot invite members',
            },
        });

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations`)
            .set('Authorization', 'Bearer valid-token')
            .send({
                email: 'member@example.com',
            });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Tenant is archived',
        });
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
        const { upsert } = mockInvitationEmailJobQueue();
        rpc.mockResolvedValue({
            data: {
                id: 'invite-123',
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'admin',
                status: 'pending',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'pending',
                email_sent_at: null,
                email_message_id: null,
                email_delivery_error: null,
                delivery_attempts: 0,
                accept_token_expires_at: null,
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
        });
        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                invitation_id: 'invite-123',
                status: 'pending',
                accept_token: expect.any(String),
            }),
            {
                onConflict: 'invitation_id',
            }
        );
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'invite-123',
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'admin',
                status: 'pending',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'pending',
                email_sent_at: null,
                email_message_id: null,
                email_delivery_error: null,
                delivery_attempts: 0,
                accept_token_expires_at: expect.any(String),
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
        mockInvitationEmailJobQueue();

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

describe('GET /tenants/:tenantId/invitations', () => {
    it('lists invitations for a tenant owner', async () => {
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

        const order = vi.fn().mockResolvedValue({
            data: [
                {
                    id: invitationId,
                    tenant_id: tenantId,
                    email: 'member@example.com',
                    role: 'member',
                    status: 'pending',
                    invited_by_user_id: 'user-123',
                    created_at: '2026-05-25T00:00:00.000Z',
                    accepted_at: null,
                    email_delivery_status: 'sent',
                    email_sent_at: '2026-05-25T00:01:00.000Z',
                    email_message_id: 'msg_123',
                    email_delivery_error: null,
                    delivery_attempts: 1,
                    accept_token_expires_at: '2026-06-01T00:00:00.000Z',
                },
            ],
            error: null,
        });
        const eqInvites = vi.fn(() => ({ order }));
        const selectInvites = vi.fn(() => ({ eq: eqInvites }));

        from.mockImplementation((table: string) => {
            if (table === 'memberships') {
                const maybeSingle = vi.fn().mockResolvedValue({
                    data: {
                        id: 'membership-123',
                        tenant_id: tenantId,
                        role: 'owner',
                        status: 'active',
                    },
                    error: null,
                });
                const eqStatus = vi.fn(() => ({ maybeSingle }));
                const eqUser = vi.fn(() => ({ eq: eqStatus }));
                const eqTenant = vi.fn(() => ({ eq: eqUser }));
                return { select: vi.fn(() => ({ eq: eqTenant })) };
            }

            if (table === 'tenant_invitations') {
                return { select: selectInvites };
            }

            return { select: vi.fn() };
        });

        const app = createApp();

        const response = await request(app)
            .get(`/tenants/${tenantId}/invitations`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [
                {
                    id: invitationId,
                    tenant_id: tenantId,
                    email: 'member@example.com',
                    role: 'member',
                    status: 'pending',
                    invited_by_user_id: 'user-123',
                    created_at: '2026-05-25T00:00:00.000Z',
                    accepted_at: null,
                    email_delivery_status: 'sent',
                    email_sent_at: '2026-05-25T00:01:00.000Z',
                    email_message_id: 'msg_123',
                    email_delivery_error: null,
                    delivery_attempts: 1,
                    accept_token_expires_at: '2026-06-01T00:00:00.000Z',
                },
            ],
        });
    });
});

describe('DELETE /tenants/:tenantId/invitations/:invitationId', () => {
    it('revokes a pending invitation for an owner', async () => {
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
        mockInvitationEmailJobQueue();
        rpc.mockResolvedValue({
            data: {
                id: invitationId,
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'member',
                status: 'revoked',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'pending',
                email_sent_at: null,
                email_message_id: null,
                email_delivery_error: null,
                delivery_attempts: 0,
                accept_token_expires_at: null,
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .delete(`/tenants/${tenantId}/invitations/${invitationId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(rpc).toHaveBeenCalledWith('revoke_tenant_invitation', {
            p_tenant_id: tenantId,
            p_invitation_id: invitationId,
        });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                id: invitationId,
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'member',
                status: 'revoked',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'pending',
                email_sent_at: null,
                email_message_id: null,
                email_delivery_error: null,
                delivery_attempts: 0,
                accept_token_expires_at: null,
            },
        });
    });

    it('returns 409 when the invitation is no longer pending', async () => {
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
        mockInvitationEmailJobQueue();
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'Invitation is no longer pending',
            },
        });

        const app = createApp();

        const response = await request(app)
            .delete(`/tenants/${tenantId}/invitations/${invitationId}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Invitation is no longer pending',
        });
    });
});

describe('POST /tenants/:tenantId/invitations/:invitationId/resend', () => {
    it('sets rate limit headers on the response', async () => {
        const app = createApp();

        const response = await request(app).post(
            `/tenants/${tenantId}/invitations/${invitationId}/resend`
        );

        expect(response.headers['ratelimit-limit']).toBe('10');
    });

    it('reissues a token and re-enqueues the email for a pending invitation, resetting attempts', async () => {
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
        mockResendFlow();
        const { upsert } = mockInvitationEmailJobQueue();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', 'Bearer valid-token');

        expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                invitation_id: invitationId,
                status: 'pending',
                accept_token: expect.any(String),
                attempts: 0,
                last_error: null,
                processed_at: null,
            }),
            {
                onConflict: 'invitation_id',
            }
        );
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                id: invitationId,
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'member',
                status: 'pending',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'failed',
                email_sent_at: null,
                email_message_id: null,
                email_delivery_error: 'boom',
                delivery_attempts: 5,
                accept_token_expires_at: expect.any(String),
            },
        });
    });

    it('returns 404 when the invitation does not exist for the tenant', async () => {
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
        mockResendFlow({ invitation: null });
        mockInvitationEmailJobQueue();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Invitation not found',
        });
    });

    it('returns 409 when the invitation is no longer pending', async () => {
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
        mockResendFlow({
            invitation: {
                id: invitationId,
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'member',
                status: 'accepted',
                invited_by_user_id: 'user-123',
                email_delivery_status: 'sent',
                email_sent_at: '2026-05-25T00:01:00.000Z',
                email_message_id: 'msg_123',
                email_delivery_error: null,
                delivery_attempts: 1,
                accept_token_expires_at: null,
            },
        });
        mockInvitationEmailJobQueue();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Only pending invitations can be resent',
        });
    });

    it('returns 409 when the tenant is archived', async () => {
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
        mockResendFlow({ tenant: { id: tenantId, status: 'archived' } });
        mockInvitationEmailJobQueue();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Tenant is archived',
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
        mockResendFlow({ role: 'member' });
        mockInvitationEmailJobQueue();

        const app = createApp();

        const response = await request(app)
            .post(`/tenants/${tenantId}/invitations/${invitationId}/resend`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: 'Forbidden',
        });
    });
});
