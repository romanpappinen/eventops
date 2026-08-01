import { defineStore } from 'pinia'
import {
  createTenant as createTenantRequest,
  createTenantApiKey as createTenantApiKeyRequest,
  createTenantEvent as createTenantEventRequest,
  getTenantEventStats as getTenantEventStatsRequest,
  getTenants as getTenantsRequest,
  inviteTenantMember as inviteTenantMemberRequest,
  listTenantApiKeys as listTenantApiKeysRequest,
  listTenantEvents as listTenantEventsRequest,
  listTenantInvitations as listTenantInvitationsRequest,
  resendTenantInvitation as resendTenantInvitationRequest,
  revokeTenantApiKey as revokeTenantApiKeyRequest,
  revokeTenantInvitation as revokeTenantInvitationRequest,
  type ApiKey,
  type EventStats,
  type Tenant,
  type TenantEvent,
  type TenantInvitation,
} from '../lib/api'

type TenantStatus = 'idle' | 'loading' | 'saving' | 'error'

function upsertById<T extends { id: string }>(list: T[], item: T) {
  const existingIndex = list.findIndex((existing) => existing.id === item.id)

  if (existingIndex >= 0) {
    list.splice(existingIndex, 1, item)
  } else {
    list.unshift(item)
  }
}

export const useTenantsStore = defineStore('tenants', {
  state: () => ({
    items: [] as Tenant[],
    status: 'idle' as TenantStatus,
    error: null as string | null,
    lastInvitation: null as TenantInvitation | null,
    invitations: [] as TenantInvitation[],
    invitationsLoaded: false,
    invitationsStatus: 'idle' as TenantStatus,
    invitationsError: null as string | null,
    apiKeys: [] as ApiKey[],
    apiKeysLoaded: false,
    apiKeysStatus: 'idle' as TenantStatus,
    apiKeysError: null as string | null,
    events: [] as TenantEvent[],
    eventsLoaded: false,
    eventsStatus: 'idle' as TenantStatus,
    eventsError: null as string | null,
    eventStats: null as EventStats | null,
    eventStatsStatus: 'idle' as TenantStatus,
    eventStatsError: null as string | null,
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
        upsertById(this.items, tenant)

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

        if (this.invitationsLoaded) {
          this.invitations.unshift(invitation)
        }

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
        this.invitationsLoaded = true
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
        upsertById(this.invitations, invitation)

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
        upsertById(this.invitations, invitation)

        this.invitationsStatus = 'idle'
        return invitation
      } catch (error) {
        this.invitationsStatus = 'error'
        this.invitationsError =
          error instanceof Error ? error.message : 'Failed to revoke invitation'
        throw error
      }
    },
    async fetchApiKeys(accessToken: string, tenantId: string) {
      this.apiKeysStatus = 'loading'
      this.apiKeysError = null

      try {
        this.apiKeys = await listTenantApiKeysRequest(accessToken, tenantId)
        this.apiKeysLoaded = true
        this.apiKeysStatus = 'idle'
        return this.apiKeys
      } catch (error) {
        this.apiKeysStatus = 'error'
        this.apiKeysError = error instanceof Error ? error.message : 'Failed to load API keys'
        throw error
      }
    },
    async createApiKey(accessToken: string, tenantId: string, name: string) {
      this.apiKeysStatus = 'saving'
      this.apiKeysError = null

      try {
        const apiKey = await createTenantApiKeyRequest(accessToken, tenantId, name)
        this.apiKeys.unshift(apiKey)

        this.apiKeysStatus = 'idle'
        return apiKey
      } catch (error) {
        this.apiKeysStatus = 'error'
        this.apiKeysError = error instanceof Error ? error.message : 'Failed to create API key'
        throw error
      }
    },
    async revokeApiKey(accessToken: string, tenantId: string, apiKeyId: string) {
      this.apiKeysStatus = 'saving'
      this.apiKeysError = null

      try {
        const apiKey = await revokeTenantApiKeyRequest(accessToken, tenantId, apiKeyId)
        upsertById(this.apiKeys, apiKey)

        this.apiKeysStatus = 'idle'
        return apiKey
      } catch (error) {
        this.apiKeysStatus = 'error'
        this.apiKeysError = error instanceof Error ? error.message : 'Failed to revoke API key'
        throw error
      }
    },
    async fetchEvents(accessToken: string, tenantId: string) {
      this.eventsStatus = 'loading'
      this.eventsError = null

      try {
        this.events = await listTenantEventsRequest(accessToken, tenantId)
        this.eventsLoaded = true
        this.eventsStatus = 'idle'
        return this.events
      } catch (error) {
        this.eventsStatus = 'error'
        this.eventsError = error instanceof Error ? error.message : 'Failed to load events'
        throw error
      }
    },
    async fetchEventStats(accessToken: string, tenantId: string, windowDays: number) {
      this.eventStatsStatus = 'loading'
      this.eventStatsError = null

      try {
        this.eventStats = await getTenantEventStatsRequest(accessToken, tenantId, windowDays)
        this.eventStatsStatus = 'idle'
        return this.eventStats
      } catch (error) {
        this.eventStatsStatus = 'error'
        this.eventStatsError = error instanceof Error ? error.message : 'Failed to load event stats'
        throw error
      }
    },
    async createEvent(
      accessToken: string,
      tenantId: string,
      input: {
        source: string
        type: string
        subject?: string
        occurredAt: string
        payload: Record<string, unknown>
        metadata?: Record<string, unknown>
        idempotencyKey?: string
      },
    ) {
      this.eventsStatus = 'saving'
      this.eventsError = null

      try {
        const event = await createTenantEventRequest(accessToken, tenantId, input)
        if (this.eventsLoaded) {
          upsertById(this.events, event)
        }

        this.eventsStatus = 'idle'
        return event
      } catch (error) {
        this.eventsStatus = 'error'
        this.eventsError = error instanceof Error ? error.message : 'Failed to create event'
        throw error
      }
    },
  },
})
