import { defineStore } from 'pinia'
import {
  createTenant as createTenantRequest,
  getTenants as getTenantsRequest,
  inviteTenantMember as inviteTenantMemberRequest,
  listTenantInvitations as listTenantInvitationsRequest,
  resendTenantInvitation as resendTenantInvitationRequest,
  revokeTenantInvitation as revokeTenantInvitationRequest,
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
    invitations: [] as TenantInvitation[],
    invitationsStatus: 'idle' as TenantStatus,
    invitationsError: null as string | null,
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
        this.invitations.unshift(invitation)
        this.status = 'idle'
        return invitation
      } catch (error) {
        this.status = 'error'
        this.error = error instanceof Error ? error.message : 'Failed to invite tenant member'
        throw error
      }
    },
    async fetchInvitations(accessToken: string, tenantId: string) {
      this.invitationsStatus = 'loading'
      this.invitationsError = null

      try {
        this.invitations = await listTenantInvitationsRequest(accessToken, tenantId)
        this.invitationsStatus = 'idle'
        return this.invitations
      } catch (error) {
        this.invitationsStatus = 'error'
        this.invitationsError =
          error instanceof Error ? error.message : 'Failed to load invitations'
        throw error
      }
    },
    async resendInvitation(accessToken: string, tenantId: string, invitationId: string) {
      this.invitationsStatus = 'saving'
      this.invitationsError = null

      try {
        const invitation = await resendTenantInvitationRequest(accessToken, tenantId, invitationId)
        const existingIndex = this.invitations.findIndex((item) => item.id === invitation.id)

        if (existingIndex >= 0) {
          this.invitations.splice(existingIndex, 1, invitation)
        } else {
          this.invitations.unshift(invitation)
        }

        this.invitationsStatus = 'idle'
        return invitation
      } catch (error) {
        this.invitationsStatus = 'error'
        this.invitationsError =
          error instanceof Error ? error.message : 'Failed to resend invitation'
        throw error
      }
    },
    async revokeInvitation(accessToken: string, tenantId: string, invitationId: string) {
      this.invitationsStatus = 'saving'
      this.invitationsError = null

      try {
        const invitation = await revokeTenantInvitationRequest(accessToken, tenantId, invitationId)
        const existingIndex = this.invitations.findIndex((item) => item.id === invitation.id)

        if (existingIndex >= 0) {
          this.invitations.splice(existingIndex, 1, invitation)
        } else {
          this.invitations.unshift(invitation)
        }

        this.invitationsStatus = 'idle'
        return invitation
      } catch (error) {
        this.invitationsStatus = 'error'
        this.invitationsError =
          error instanceof Error ? error.message : 'Failed to revoke invitation'
        throw error
      }
    },
  },
})
