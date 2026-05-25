import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const invitationId = '550e8400-e29b-41d4-a716-446655440001';
const tenantId = '550e8400-e29b-41d4-a716-446655440000';
const token = 'invite-token-123';

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

function mockInvitationLookup(options?: {
    invitation?: Record<string, unknown> | null;
    tenant?: Record<string, unknown> | null;
}) {
    const invitationMaybeSingle = vi.fn().mockResolvedValue({
        data:
            options?.invitation ??
            {
                id: invitationId,
                tenant_id: tenantId,
                email: 'member@example.com',
                role: 'member',
                status: 'pending',
                accepted_at: null,
                invited_by_user_id: 'user-123',
                accept_token_expires_at: '2026-06-01T00:00:00.000Z',
            },
        error: null,
    });
    const invitationEq = vi.fn(() => ({ maybeSingle: invitationMaybeSingle }));
    const invitationSelect = vi.fn(() => ({ eq: invitationEq }));

    const tenantMaybeSingle = vi.fn().mockResolvedValue({
        data:
            options?.tenant ??
            {
                id: tenantId,
                name: 'Acme Ops',
                status: 'active',
            },
        error: null,
    });
    const tenantEq = vi.fn(() => ({ maybeSingle: tenantMaybeSingle }));
    const tenantSelect = vi.fn(() => ({ eq: tenantEq }));

    adminFrom.mockImplementation((table: string) => {
        if (table === 'tenant_invitations') {
            return { select: invitationSelect };
        }

        if (table === 'tenants') {
            return { select: tenantSelect };
        }

        return { select: vi.fn() };
    });
}

describe('GET /invitations/accept', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).get('/invitations/accept');

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('returns invitation details for a valid token', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'member@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        mockInvitationLookup();

        const app = createApp();

        const response = await request(app)
            .get(`/invitations/accept?token=${token}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            item: {
                invitationId,
                tenantId,
                tenantName: 'Acme Ops',
                role: 'member',
                status: 'pending',
                expiresAt: '2026-06-01T00:00:00.000Z',
            },
        });
    });

    it('returns archived when the tenant is archived', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'member@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        mockInvitationLookup({
            tenant: {
                id: tenantId,
                name: 'Acme Ops',
                status: 'archived',
            },
        });

        const app = createApp();

        const response = await request(app)
            .get(`/invitations/accept?token=${token}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(200);
        expect(response.body.item.status).toBe('archived');
    });

    it('returns 403 when the invitation belongs to a different email address', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'other@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        mockInvitationLookup();

        const app = createApp();

        const response = await request(app)
            .get(`/invitations/accept?token=${token}`)
            .set('Authorization', 'Bearer valid-token');

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: 'This invitation belongs to a different email address',
        });
    });
});

describe('POST /invitations/accept', () => {
    it('returns 401 when no bearer token is provided', async () => {
        const app = createApp();

        const response = await request(app).post('/invitations/accept').send({ token });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
            error: 'Unauthorized',
        });
    });

    it('accepts a pending invitation for the authenticated user', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'member@example.com',
                    user_metadata: {
                        full_name: 'Member User',
                    },
                },
            },
            error: null,
        });
        rpc.mockResolvedValue({
            data: {
                id: 'membership-456',
                tenant_id: tenantId,
                user_id: 'user-456',
                role: 'admin',
                status: 'active',
                created_at: '2026-05-25T00:00:00.000Z',
            },
            error: null,
        });

        const app = createApp();

        const response = await request(app)
            .post('/invitations/accept')
            .set('Authorization', 'Bearer valid-token')
            .send({ token });

        expect(ensureUserProfile).toHaveBeenCalledWith('valid-token', {
            id: 'user-456',
            email: 'member@example.com',
            fullName: 'Member User',
            avatarUrl: null,
        });
        expect(rpc).toHaveBeenCalledWith('accept_tenant_invitation_by_token', {
            p_token_hash: expect.any(String),
        });
        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            item: {
                id: 'membership-456',
                tenant_id: tenantId,
                user_id: 'user-456',
                role: 'admin',
                status: 'active',
                created_at: '2026-05-25T00:00:00.000Z',
            },
        });
    });

    it('returns 403 when the invitation belongs to a different email', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'member@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'Invitation does not belong to authenticated user',
            },
        });

        const app = createApp();

        const response = await request(app)
            .post('/invitations/accept')
            .set('Authorization', 'Bearer valid-token')
            .send({ token });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({
            error: 'This invitation belongs to a different email address',
        });
    });

    it('returns 409 when the invitation has expired', async () => {
        getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-456',
                    email: 'member@example.com',
                    user_metadata: {},
                },
            },
            error: null,
        });
        rpc.mockResolvedValue({
            data: null,
            error: {
                message: 'Invitation has expired',
            },
        });

        const app = createApp();

        const response = await request(app)
            .post('/invitations/accept')
            .set('Authorization', 'Bearer valid-token')
            .send({ token });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'Invitation has expired',
        });
    });
});
