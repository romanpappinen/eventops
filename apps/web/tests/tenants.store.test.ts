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
})
