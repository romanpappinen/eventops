<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'
import { useTenantsStore } from '../stores/tenants'
import type { ApiKey, TenantInvitation } from '../lib/api'

const route = useRoute()
const auth = useAuthStore()
const tenants = useTenantsStore()

const invitationEmail = ref('')
const invitationRole = ref<'admin' | 'member'>('member')
const inviteError = ref<string | null>(null)
const inviteSuccess = ref<string | null>(null)

const invitationActionError = ref<string | null>(null)
const invitationActionSuccess = ref<string | null>(null)
const pendingActionId = ref<string | null>(null)

const apiKeyName = ref('')
const apiKeyError = ref<string | null>(null)
const lastCreatedApiKey = ref<ApiKey | null>(null)
const copyFeedback = ref<string | null>(null)

const apiKeyActionError = ref<string | null>(null)
const apiKeyActionSuccess = ref<string | null>(null)
const pendingApiKeyActionId = ref<string | null>(null)

const tenantId = computed(() =>
  typeof route.params.tenantId === 'string' ? route.params.tenantId : '',
)

const tenant = computed(() => tenants.getById(tenantId.value))
const justCreated = computed(() => route.query.created === '1')

function invitationDisplayStatus(invitation: TenantInvitation) {
  if (
    invitation.status === 'pending' &&
    invitation.acceptTokenExpiresAt &&
    new Date(invitation.acceptTokenExpiresAt).getTime() <= Date.now()
  ) {
    return 'expired'
  }

  return invitation.status
}

function canActOnInvitation(invitation: TenantInvitation) {
  if (tenant.value && tenant.value.status !== 'active') {
    return false
  }

  const displayStatus = invitationDisplayStatus(invitation)
  return displayStatus === 'pending' || displayStatus === 'expired'
}

onMounted(async () => {
  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    return
  }

  if (!tenant.value) {
    try {
      await tenants.fetchTenants(accessToken)
    } catch {
      return
    }
  }

  try {
    await tenants.fetchInvitations(accessToken, tenantId.value)
  } catch {
    return
  }

  try {
    await tenants.fetchApiKeys(accessToken, tenantId.value)
  } catch {
    return
  }
})

async function onInviteSubmit() {
  inviteError.value = null
  inviteSuccess.value = null

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    inviteError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  try {
    const invitation = await tenants.inviteTenantMember(accessToken, tenantId.value, {
      email: invitationEmail.value,
      role: invitationRole.value,
    })

    invitationEmail.value = ''
    invitationRole.value = 'member'
    inviteSuccess.value = `Invitation created for ${invitation.email}.`
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : 'Failed to invite tenant member'
  }
}

async function onResend(invitation: TenantInvitation) {
  invitationActionError.value = null
  invitationActionSuccess.value = null

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    invitationActionError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  pendingActionId.value = invitation.id

  try {
    await tenants.resendInvitation(accessToken, tenantId.value, invitation.id)
    invitationActionSuccess.value = `Invitation resent to ${invitation.email}.`
  } catch (error) {
    invitationActionError.value =
      error instanceof Error ? error.message : 'Failed to resend invitation'
  } finally {
    pendingActionId.value = null
  }
}

async function onRevoke(invitation: TenantInvitation) {
  invitationActionError.value = null
  invitationActionSuccess.value = null

  if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) {
    return
  }

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    invitationActionError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  pendingActionId.value = invitation.id

  try {
    await tenants.revokeInvitation(accessToken, tenantId.value, invitation.id)
    invitationActionSuccess.value = `Invitation for ${invitation.email} revoked.`
  } catch (error) {
    invitationActionError.value =
      error instanceof Error ? error.message : 'Failed to revoke invitation'
  } finally {
    pendingActionId.value = null
  }
}

async function onCreateApiKey() {
  apiKeyError.value = null
  copyFeedback.value = null

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    apiKeyError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  try {
    const apiKey = await tenants.createApiKey(accessToken, tenantId.value, apiKeyName.value)
    apiKeyName.value = ''
    lastCreatedApiKey.value = apiKey
  } catch (error) {
    apiKeyError.value = error instanceof Error ? error.message : 'Failed to create API key'
  }
}

async function onCopyApiKey() {
  if (!lastCreatedApiKey.value?.rawKey) {
    return
  }

  try {
    await navigator.clipboard.writeText(lastCreatedApiKey.value.rawKey)
    copyFeedback.value = 'Copied to clipboard.'
  } catch {
    copyFeedback.value = 'Could not copy automatically -- select and copy the key manually.'
  }
}

async function onRevokeApiKey(apiKey: ApiKey) {
  apiKeyActionError.value = null
  apiKeyActionSuccess.value = null

  if (!window.confirm(`Revoke the API key "${apiKey.name}"? Any integration using it will stop working immediately.`)) {
    return
  }

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    apiKeyActionError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  pendingApiKeyActionId.value = apiKey.id

  try {
    await tenants.revokeApiKey(accessToken, tenantId.value, apiKey.id)
    apiKeyActionSuccess.value = `API key "${apiKey.name}" revoked.`
    if (lastCreatedApiKey.value?.id === apiKey.id) {
      lastCreatedApiKey.value = null
    }
  } catch (error) {
    apiKeyActionError.value = error instanceof Error ? error.message : 'Failed to revoke API key'
  } finally {
    pendingApiKeyActionId.value = null
  }
}
</script>

<template>
  <section class="tenant-page">
    <p v-if="justCreated" class="feedback feedback-success">
      Tenant created. You are now the owner and can invite members.
    </p>

    <p v-if="tenants.error && !tenant" class="feedback feedback-error">
      {{ tenants.error }}
    </p>

    <div v-if="!tenant" class="tenant-card">
      <p class="eyebrow">Tenant</p>
      <h1>Tenant not found</h1>
      <p class="intro">
        This route only exposes tenants returned by your authenticated membership list.
      </p>
      <RouterLink class="secondary-link" :to="{ name: routeNames.tenants }">
        Back to tenants
      </RouterLink>
    </div>

    <template v-else>
      <div class="tenant-card">
        <p class="eyebrow">Tenant settings</p>
        <h1>{{ tenant.name }}</h1>
        <p class="intro">
          Tenant updates are intentionally not exposed here until the backend adds a dedicated
          update endpoint with owner authorization checks.
        </p>

        <dl class="detail-grid">
          <div>
            <dt>Name</dt>
            <dd>{{ tenant.name }}</dd>
          </div>
          <div>
            <dt>Slug</dt>
            <dd><code>{{ tenant.slug }}</code></dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{{ tenant.plan }}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{{ tenant.status }}</dd>
          </div>
          <div class="description-block">
            <dt>Description</dt>
            <dd>{{ tenant.description ?? 'No description' }}</dd>
          </div>
        </dl>
      </div>

      <div class="tenant-card invite-card">
        <p class="eyebrow">Invite members</p>
        <h2>Invite by email</h2>
        <p class="intro">
          Invitations are sent through the backend using your current bearer token. Only tenant
          owners should be able to create them.
        </p>

        <form class="invite-form" @submit.prevent="onInviteSubmit">
          <label>
            <span>Email</span>
            <input v-model="invitationEmail" type="email" required />
          </label>

          <label>
            <span>Role</span>
            <select v-model="invitationRole">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <p v-if="inviteError || tenants.error" class="feedback feedback-error">
            {{ inviteError ?? tenants.error }}
          </p>
          <p v-if="inviteSuccess" class="feedback feedback-success">
            {{ inviteSuccess }}
          </p>

          <div class="actions">
            <button class="primary-button" type="submit" :disabled="tenants.status === 'saving'">
              {{ tenants.status === 'saving' ? 'Sending invitation...' : 'Invite member' }}
            </button>
            <RouterLink class="secondary-link" :to="{ name: routeNames.tenants }">
              Back to tenants
            </RouterLink>
          </div>
        </form>
      </div>

      <div class="tenant-card invitations-card">
        <p class="eyebrow">Invitations</p>
        <h2>Pending &amp; past invitations</h2>

        <p v-if="invitationActionError" class="feedback feedback-error">
          {{ invitationActionError }}
        </p>
        <p v-if="invitationActionSuccess" class="feedback feedback-success">
          {{ invitationActionSuccess }}
        </p>
        <p v-if="tenants.invitationsError" class="feedback feedback-error">
          {{ tenants.invitationsError }}
        </p>

        <p v-if="tenants.invitationsStatus === 'loading'">Loading invitations...</p>

        <p v-else-if="tenants.invitations.length === 0" class="intro">
          No invitations yet. Invite a member above to get started.
        </p>

        <div v-else class="table-panel">
          <table class="invitations-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Email delivery</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invitation in tenants.invitations" :key="invitation.id">
                <td>{{ invitation.email }}</td>
                <td>{{ invitation.role }}</td>
                <td>{{ invitationDisplayStatus(invitation) }}</td>
                <td>
                  {{ invitation.emailDeliveryStatus }}
                  <span v-if="invitation.emailDeliveryStatus === 'failed'" class="delivery-error">
                    {{ invitation.emailDeliveryError }}
                  </span>
                </td>
                <td>
                  {{
                    invitation.acceptTokenExpiresAt
                      ? new Date(invitation.acceptTokenExpiresAt).toLocaleString()
                      : 'N/A'
                  }}
                </td>
                <td class="invitation-actions">
                  <template v-if="canActOnInvitation(invitation)">
                    <button
                      type="button"
                      class="table-link"
                      :disabled="pendingActionId === invitation.id"
                      @click="onResend(invitation)"
                    >
                      Resend
                    </button>
                    <button
                      type="button"
                      class="table-link table-link-danger"
                      :disabled="pendingActionId === invitation.id"
                      @click="onRevoke(invitation)"
                    >
                      Revoke
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="tenant-card api-keys-card">
        <p class="eyebrow">API keys</p>
        <h2>Server-to-server ingestion</h2>
        <p class="intro">
          Use an API key to send events into this tenant from your own backend, without a human
          Supabase session. Only tenant owners can create or revoke keys.
        </p>

        <form class="invite-form" @submit.prevent="onCreateApiKey">
          <label>
            <span>Key name</span>
            <input v-model="apiKeyName" type="text" placeholder="Production backend" required />
          </label>

          <p v-if="apiKeyError || tenants.apiKeysError" class="feedback feedback-error">
            {{ apiKeyError ?? tenants.apiKeysError }}
          </p>

          <div class="actions">
            <button
              class="primary-button"
              type="submit"
              :disabled="tenants.apiKeysStatus === 'saving'"
            >
              {{ tenants.apiKeysStatus === 'saving' ? 'Creating...' : 'Create API key' }}
            </button>
          </div>
        </form>

        <div v-if="lastCreatedApiKey?.rawKey" class="raw-key-panel">
          <p class="raw-key-warning">
            Copy this key now -- you will not be able to see it again.
          </p>
          <code class="raw-key-value">{{ lastCreatedApiKey.rawKey }}</code>
          <div class="actions">
            <button type="button" class="secondary-link" @click="onCopyApiKey">
              Copy to clipboard
            </button>
            <span v-if="copyFeedback" class="copy-feedback">{{ copyFeedback }}</span>
          </div>
        </div>

        <p v-if="apiKeyActionError" class="feedback feedback-error">
          {{ apiKeyActionError }}
        </p>
        <p v-if="apiKeyActionSuccess" class="feedback feedback-success">
          {{ apiKeyActionSuccess }}
        </p>

        <p v-if="tenants.apiKeysStatus === 'loading'">Loading API keys...</p>

        <p v-else-if="tenants.apiKeys.length === 0" class="intro">
          No API keys yet. Create one above to start sending events from your backend.
        </p>

        <div v-else class="table-panel">
          <table class="invitations-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key prefix</th>
                <th>Created</th>
                <th>Last used</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="apiKey in tenants.apiKeys" :key="apiKey.id">
                <td>{{ apiKey.name }}</td>
                <td><code>{{ apiKey.keyPrefix }}...</code></td>
                <td>{{ new Date(apiKey.createdAt).toLocaleString() }}</td>
                <td>{{ apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : 'Never' }}</td>
                <td>{{ apiKey.revokedAt ? 'Revoked' : 'Active' }}</td>
                <td class="invitation-actions">
                  <button
                    v-if="!apiKey.revokedAt"
                    type="button"
                    class="table-link table-link-danger"
                    :disabled="pendingApiKeyActionId === apiKey.id"
                    @click="onRevokeApiKey(apiKey)"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <RouterLink
          class="secondary-link events-link"
          :to="{ name: routeNames.tenantEvents, params: { tenantId: tenantId } }"
        >
          View events log
        </RouterLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tenant-page {
  min-height: 100vh;
  padding: 32px;
  display: grid;
  gap: 24px;
}

.tenant-card {
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 32px;
  background: rgba(255, 250, 242, 0.82);
  box-shadow: var(--shadow);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 12px;
  font-weight: 700;
}

h1,
h2 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
}

.intro {
  margin: 16px 0 0;
  color: var(--muted);
  max-width: 60ch;
}

.detail-grid {
  margin: 28px 0 0;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.detail-grid div {
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.64);
  border: 1px solid rgba(29, 27, 23, 0.08);
}

.description-block {
  grid-column: 1 / -1;
}

dt {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

dd {
  margin: 8px 0 0;
  color: var(--ink);
  font-weight: 600;
}

.invite-form {
  margin-top: 28px;
  display: grid;
  gap: 18px;
}

label {
  display: grid;
  gap: 8px;
  font-weight: 600;
  color: var(--ink);
}

input,
select {
  width: 100%;
  border: 1px solid rgba(29, 27, 23, 0.14);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.76);
  color: var(--ink);
}

.feedback {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  font-weight: 600;
}

.feedback-error {
  color: var(--danger);
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.16);
}

.feedback-success {
  color: var(--success);
  background: rgba(21, 111, 72, 0.08);
  border: 1px solid rgba(21, 111, 72, 0.16);
}

.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.primary-button,
.secondary-link {
  min-height: 48px;
  border-radius: 16px;
  padding: 0 18px;
  font-weight: 700;
  text-decoration: none;
}

.primary-button {
  border: 0;
  background: var(--accent);
  color: white;
}

.primary-button:disabled {
  opacity: 0.7;
  cursor: progress;
}

.secondary-link {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(29, 27, 23, 0.12);
  background: rgba(255, 255, 255, 0.68);
}

.table-panel {
  margin-top: 20px;
  overflow-x: auto;
}

.invitations-table {
  width: 100%;
  border-collapse: collapse;
}

.invitations-table th,
.invitations-table td {
  padding: 16px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(29, 27, 23, 0.08);
  vertical-align: top;
}

.invitations-table th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.invitation-actions {
  display: flex;
  gap: 8px;
}

.delivery-error {
  display: block;
  margin-top: 4px;
  color: var(--danger);
  font-size: 12px;
  font-weight: 600;
}

.table-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  padding: 10px 12px;
  font-weight: 700;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(29, 27, 23, 0.08);
  cursor: pointer;
}

.table-link:disabled {
  opacity: 0.6;
  cursor: progress;
}

.table-link-danger {
  color: var(--danger);
  border-color: rgba(180, 35, 24, 0.24);
}

.raw-key-panel {
  margin-top: 20px;
  padding: 18px;
  border-radius: 18px;
  background: rgba(21, 111, 72, 0.08);
  border: 1px solid rgba(21, 111, 72, 0.2);
  display: grid;
  gap: 12px;
}

.raw-key-warning {
  margin: 0;
  color: var(--success);
  font-weight: 700;
}

.raw-key-value {
  display: block;
  word-break: break-all;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(29, 27, 23, 0.1);
}

.copy-feedback {
  color: var(--muted);
  font-size: 13px;
}

.events-link {
  margin-top: 20px;
}

@media (max-width: 900px) {
  .tenant-page {
    padding: 20px;
  }

  .tenant-card {
    padding: 24px;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
