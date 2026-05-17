<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'
import { useTenantsStore } from '../stores/tenants'

const route = useRoute()
const auth = useAuthStore()
const tenants = useTenantsStore()

const invitationEmail = ref('')
const invitationRole = ref<'admin' | 'member'>('member')
const inviteError = ref<string | null>(null)
const inviteSuccess = ref<string | null>(null)

const tenantId = computed(() =>
  typeof route.params.tenantId === 'string' ? route.params.tenantId : '',
)

const tenant = computed(() => tenants.getById(tenantId.value))
const justCreated = computed(() => route.query.created === '1')

onMounted(async () => {
  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value || tenant.value) {
    return
  }

  try {
    await tenants.fetchTenants(accessToken)
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
