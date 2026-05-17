import { defineStore } from 'pinia'
import {
  createTenant as createTenantRequest,
  getTenants as getTenantsRequest,
  inviteTenantMember as inviteTenantMemberRequest,
  type Tenant,
  type TenantInvitation,
} from '../lib/api'

type TenantStatus = 'idle' | 'loading' | 'saving' | 'error'

export const useTenantsStore = defineStore('tenants', {
  state: () => ({
    items: [] as Tenant[],
    status: 'idle' as TenantStatus,
    error: null as string | null,
    lastInvitation: null as TenantInvitation | null,
  }),
  getters: {
    getById: (state) => (tenantId: string) => state.items.find((item) => item.id === tenantId) ?? null,
  },
  actions: {
    async fetchTenants(accessToken: string) {
      this.status = 'loading'
      this.error = null

      try {
        this.items = await getTenantsRequest(accessToken)
        this.status = 'idle'
        return this.items
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : 'Failed to load tenants'
        throw error
      }
    },
    async createTenant(
      accessToken: string,
      input: {
        name: string
        description?: string
        slug?: string
      },
    ) {
      this.status = 'saving'
      this.error = null

      try {
        const tenant = await createTenantRequest(accessToken, input)
        const existingIndex = this.items.findIndex((item) => item.id === tenant.id)

        if (existingIndex >= 0) {
          this.items.splice(existingIndex, 1, tenant)
        } else {
          this.items.unshift(tenant)
        }

        this.status = 'idle'
        return tenant
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : 'Failed to create tenant'
        throw error
      }
    },
    async inviteTenantMember(
      accessToken: string,
      tenantId: string,
      input: {
        email: string
        role: 'admin' | 'member'
      },
    ) {
      this.status = 'saving'
      this.error = null

      try {
        const invitation = await inviteTenantMemberRequest(accessToken, tenantId, input)
        this.lastInvitation = invitation
        this.status = 'idle'
        return invitation
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : 'Failed to invite tenant member'
        throw error
      }
    },
  },
})
