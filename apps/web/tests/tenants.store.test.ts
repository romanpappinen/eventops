import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('tenants store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads tenant memberships through the authenticated API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            tenant: {
              id: 'tenant-123',
              name: 'Acme Ops',
              description: 'Workspace',
              slug: 'acme-ops',
              plan: 'free',
              status: 'active',
              created_at: '2026-05-17T00:00:00.000Z',
            },
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const items = await store.fetchTenants('access-token')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants', {
      headers: {
        Authorization: 'Bearer access-token',
      },
    })
    expect(items).toEqual([
      {
        id: 'tenant-123',
        name: 'Acme Ops',
        description: 'Workspace',
        slug: 'acme-ops',
        plan: 'free',
        status: 'active',
        createdAt: '2026-05-17T00:00:00.000Z',
      },
    ])
  })

  it('creates a tenant through the authenticated API and stores the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'tenant-123',
          name: 'Acme Ops',
          description: 'Workspace',
          slug: 'acme-ops',
          plan: 'free',
          status: 'active',
          created_at: '2026-05-17T00:00:00.000Z',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const tenant = await store.createTenant('access-token', {
      name: 'Acme Ops',
      description: 'Workspace',
    })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({
        name: 'Acme Ops',
        description: 'Workspace',
      }),
    })
    expect(tenant.id).toBe('tenant-123')
    expect(store.items[0]?.id).toBe('tenant-123')
  })

  it('loads invitations for a tenant through the authenticated API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'invite-123',
            tenant_id: 'tenant-123',
            email: 'member@example.com',
            role: 'member',
            status: 'pending',
            invited_by_user_id: 'user-123',
            created_at: '2026-05-25T00:00:00.000Z',
            accepted_at: null,
            email_delivery_status: 'sent',
            email_sent_at: '2026-05-25T00:01:00.000Z',
            email_delivery_error: null,
            delivery_attempts: 1,
            accept_token_expires_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const items = await store.fetchInvitations('access-token', 'tenant-123')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants/tenant-123/invitations', {
      headers: {
        Authorization: 'Bearer access-token',
      },
    })
    expect(items).toEqual([
      {
        id: 'invite-123',
        tenantId: 'tenant-123',
        email: 'member@example.com',
        role: 'member',
        status: 'pending',
        invitedByUserId: 'user-123',
        createdAt: '2026-05-25T00:00:00.000Z',
        acceptedAt: null,
        emailDeliveryStatus: 'sent',
        emailSentAt: '2026-05-25T00:01:00.000Z',
        emailDeliveryError: null,
        deliveryAttempts: 1,
        acceptTokenExpiresAt: '2026-06-01T00:00:00.000Z',
      },
    ])
    expect(store.invitations).toEqual(items)
  })

  it('resends an invitation and replaces it in the store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'invite-123',
          tenant_id: 'tenant-123',
          email: 'member@example.com',
          role: 'member',
          status: 'pending',
          invited_by_user_id: 'user-123',
          created_at: '2026-05-25T00:00:00.000Z',
          accepted_at: null,
          email_delivery_status: 'pending',
          email_sent_at: null,
          email_delivery_error: null,
          delivery_attempts: 0,
          accept_token_expires_at: '2026-07-13T00:00:00.000Z',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const invitation = await store.resendInvitation('access-token', 'tenant-123', 'invite-123')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/tenants/tenant-123/invitations/invite-123/resend',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )
    expect(invitation.acceptTokenExpiresAt).toBe('2026-07-13T00:00:00.000Z')
    expect(store.invitations[0]?.acceptTokenExpiresAt).toBe('2026-07-13T00:00:00.000Z')
  })

  it('revokes an invitation and replaces it in the store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'invite-123',
          tenant_id: 'tenant-123',
          email: 'member@example.com',
          role: 'member',
          status: 'revoked',
          invited_by_user_id: 'user-123',
          created_at: '2026-05-25T00:00:00.000Z',
          accepted_at: null,
          email_delivery_status: 'sent',
          email_sent_at: '2026-05-25T00:01:00.000Z',
          email_delivery_error: null,
          delivery_attempts: 1,
          accept_token_expires_at: '2026-06-01T00:00:00.000Z',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const invitation = await store.revokeInvitation('access-token', 'tenant-123', 'invite-123')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/tenants/tenant-123/invitations/invite-123',
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )
    expect(invitation.status).toBe('revoked')
    expect(store.invitations[0]?.status).toBe('revoked')
  })
})
