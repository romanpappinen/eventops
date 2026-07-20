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

  it('loads API keys for a tenant through the authenticated API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'key-123',
            tenantId: 'tenant-123',
            name: 'Production backend',
            keyPrefix: 'eo_live_abc123',
            createdAt: '2026-07-01T00:00:00.000Z',
            lastUsedAt: null,
            revokedAt: null,
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const items = await store.fetchApiKeys('access-token', 'tenant-123')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants/tenant-123/api-keys', {
      headers: {
        Authorization: 'Bearer access-token',
      },
    })
    expect(items).toEqual([
      {
        id: 'key-123',
        tenantId: 'tenant-123',
        name: 'Production backend',
        keyPrefix: 'eo_live_abc123',
        createdAt: '2026-07-01T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ])
    expect(store.apiKeys).toEqual(items)
  })

  it('creates an API key and stores it with the one-time raw key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'key-123',
          tenantId: 'tenant-123',
          name: 'Production backend',
          keyPrefix: 'eo_live_abc123',
          createdAt: '2026-07-01T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: null,
          rawKey: 'eo_live_abc123therest',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const apiKey = await store.createApiKey('access-token', 'tenant-123', 'Production backend')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants/tenant-123/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({ name: 'Production backend' }),
    })
    expect(apiKey.rawKey).toBe('eo_live_abc123therest')
    expect(store.apiKeys[0]?.id).toBe('key-123')
  })

  it('revokes an API key and replaces it in the store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'key-123',
          tenantId: 'tenant-123',
          name: 'Production backend',
          keyPrefix: 'eo_live_abc123',
          createdAt: '2026-07-01T00:00:00.000Z',
          lastUsedAt: null,
          revokedAt: '2026-07-15T00:00:00.000Z',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const apiKey = await store.revokeApiKey('access-token', 'tenant-123', 'key-123')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/tenants/tenant-123/api-keys/key-123',
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    )
    expect(apiKey.revokedAt).toBe('2026-07-15T00:00:00.000Z')
    expect(store.apiKeys[0]?.revokedAt).toBe('2026-07-15T00:00:00.000Z')
  })

  it('loads events for a tenant through the authenticated API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'event-123',
            tenantId: 'tenant-123',
            source: 'external-backend',
            type: 'order.created',
            subject: 'order-1',
            occurredAt: '2026-07-10T00:00:00.000Z',
            receivedAt: '2026-07-10T00:00:01.000Z',
            payload: { orderId: 'order-1' },
            metadata: {},
            status: 'received',
            createdByUserId: null,
            createdByApiKeyId: 'key-123',
            idempotencyKey: null,
            createdAt: '2026-07-10T00:00:01.000Z',
            updatedAt: '2026-07-10T00:00:01.000Z',
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()

    const items = await store.fetchEvents('access-token', 'tenant-123')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants/tenant-123/events', {
      headers: {
        Authorization: 'Bearer access-token',
      },
    })
    expect(items[0]?.id).toBe('event-123')
    expect(store.events).toEqual(items)
  })

  it('creates an event through the authenticated API and stores it once the log is loaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: 'event-456',
          tenantId: 'tenant-123',
          source: 'web-app',
          type: 'order.created',
          subject: null,
          occurredAt: '2026-07-15T00:00:00.000Z',
          receivedAt: '2026-07-15T00:00:01.000Z',
          payload: { orderId: 'order-2' },
          metadata: {},
          status: 'received',
          createdByUserId: 'user-123',
          createdByApiKeyId: null,
          idempotencyKey: null,
          createdAt: '2026-07-15T00:00:01.000Z',
          updatedAt: '2026-07-15T00:00:01.000Z',
        },
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const { useTenantsStore } = await import('../src/stores/tenants')
    const store = useTenantsStore()
    store.eventsLoaded = true

    const event = await store.createEvent('access-token', 'tenant-123', {
      source: 'web-app',
      type: 'order.created',
      occurredAt: '2026-07-15T00:00:00.000Z',
      payload: { orderId: 'order-2' },
    })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/tenants/tenant-123/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer access-token',
      },
      body: JSON.stringify({
        source: 'web-app',
        type: 'order.created',
        occurredAt: '2026-07-15T00:00:00.000Z',
        payload: { orderId: 'order-2' },
      }),
    })
    expect(event.id).toBe('event-456')
    expect(store.events[0]?.id).toBe('event-456')
  })
})
