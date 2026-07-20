<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'
import { useTenantsStore } from '../stores/tenants'
import type { TenantEvent } from '../lib/api'

const route = useRoute()
const auth = useAuthStore()
const tenants = useTenantsStore()

const source = ref('')
const type = ref('')
const subject = ref('')
const occurredAt = ref('')
const payloadText = ref('{}')
const metadataText = ref('')
const idempotencyKey = ref('')

const formError = ref<string | null>(null)
const formSuccess = ref<string | null>(null)

const tenantId = computed(() =>
  typeof route.params.tenantId === 'string' ? route.params.tenantId : '',
)

const tenant = computed(() => tenants.getById(tenantId.value))

function attribution(event: TenantEvent) {
  if (event.createdByApiKeyId) {
    const apiKey = tenants.apiKeys.find((key) => key.id === event.createdByApiKeyId)
    return apiKey ? `API: ${apiKey.name}` : 'API key'
  }

  if (event.createdByUserId) {
    return event.createdByUserId === auth.user?.id ? 'You' : 'Another member'
  }

  return 'Unknown'
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
    await Promise.all([
      tenants.fetchEvents(accessToken, tenantId.value),
      tenants.fetchApiKeys(accessToken, tenantId.value),
    ])
  } catch {
    return
  }
})

function resetForm() {
  source.value = ''
  type.value = ''
  subject.value = ''
  occurredAt.value = ''
  payloadText.value = '{}'
  metadataText.value = ''
  idempotencyKey.value = ''
}

async function onCreateEvent() {
  formError.value = null
  formSuccess.value = null

  const accessToken = auth.session?.access_token

  if (!accessToken || !tenantId.value) {
    formError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(payloadText.value)
  } catch {
    formError.value = 'Payload must be valid JSON.'
    return
  }

  let metadata: Record<string, unknown> | undefined
  if (metadataText.value.trim()) {
    try {
      metadata = JSON.parse(metadataText.value)
    } catch {
      formError.value = 'Metadata must be valid JSON.'
      return
    }
  }

  if (!occurredAt.value) {
    formError.value = 'Occurred at is required.'
    return
  }

  try {
    await tenants.createEvent(accessToken, tenantId.value, {
      source: source.value,
      type: type.value,
      subject: subject.value || undefined,
      occurredAt: new Date(occurredAt.value).toISOString(),
      payload,
      metadata,
      idempotencyKey: idempotencyKey.value || undefined,
    })

    formSuccess.value = 'Event created.'
    resetForm()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Failed to create event'
  }
}
</script>

<template>
  <section class="tenant-page">
    <p v-if="tenants.error && !tenant" class="feedback feedback-error">
      {{ tenants.error }}
    </p>

    <div v-if="!tenant" class="tenant-card">
      <p class="eyebrow">Events</p>
      <h1>Tenant not found</h1>
      <RouterLink class="secondary-link" :to="{ name: routeNames.tenants }">
        Back to tenants
      </RouterLink>
    </div>

    <template v-else>
      <div class="tenant-card">
        <p class="eyebrow">{{ tenant.name }}</p>
        <h1>Events log</h1>
        <p class="intro">
          Events sent by API keys (your backends) and events created manually below, all in one
          log.
        </p>
        <RouterLink
          class="secondary-link"
          :to="{ name: routeNames.tenantEdit, params: { tenantId: tenantId } }"
        >
          Back to tenant settings
        </RouterLink>
      </div>

      <div class="tenant-card">
        <p class="eyebrow">Create event</p>
        <h2>Manual event</h2>
        <p class="intro">
          Uses your current signed-in session, the same as this page's log. For real
          integrations, use an API key from the tenant settings page instead.
        </p>

        <form class="event-form" @submit.prevent="onCreateEvent">
          <label>
            <span>Source</span>
            <input v-model="source" type="text" placeholder="web-app" required />
          </label>

          <label>
            <span>Type</span>
            <input v-model="type" type="text" placeholder="order.created" required />
          </label>

          <label>
            <span>Subject (optional)</span>
            <input v-model="subject" type="text" placeholder="order-123" />
          </label>

          <label>
            <span>Occurred at</span>
            <input v-model="occurredAt" type="datetime-local" required />
          </label>

          <label>
            <span>Payload (JSON)</span>
            <textarea v-model="payloadText" rows="4" required></textarea>
          </label>

          <label>
            <span>Metadata (JSON, optional)</span>
            <textarea v-model="metadataText" rows="3"></textarea>
          </label>

          <label>
            <span>Idempotency key (optional)</span>
            <input v-model="idempotencyKey" type="text" />
          </label>

          <p v-if="formError || tenants.eventsError" class="feedback feedback-error">
            {{ formError ?? tenants.eventsError }}
          </p>
          <p v-if="formSuccess" class="feedback feedback-success">
            {{ formSuccess }}
          </p>

          <div class="actions">
            <button class="primary-button" type="submit" :disabled="tenants.eventsStatus === 'saving'">
              {{ tenants.eventsStatus === 'saving' ? 'Creating...' : 'Create event' }}
            </button>
          </div>
        </form>
      </div>

      <div class="tenant-card">
        <p class="eyebrow">Log</p>
        <h2>Recent events</h2>

        <p v-if="tenants.eventsStatus === 'loading'">Loading events...</p>

        <p v-else-if="tenants.events.length === 0" class="intro">
          No events yet. Send one from your backend using an API key, or create one manually
          above.
        </p>

        <div v-else class="table-panel">
          <table class="invitations-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Subject</th>
                <th>Occurred at</th>
                <th>Status</th>
                <th>Created by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in tenants.events" :key="event.id">
                <td>{{ event.source }}</td>
                <td>{{ event.type }}</td>
                <td>{{ event.subject ?? '—' }}</td>
                <td>{{ new Date(event.occurredAt).toLocaleString() }}</td>
                <td>{{ event.status }}</td>
                <td>{{ attribution(event) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
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

.secondary-link {
  margin-top: 20px;
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 18px;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid rgba(29, 27, 23, 0.12);
  background: rgba(255, 255, 255, 0.68);
}

.event-form {
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
textarea {
  width: 100%;
  border: 1px solid rgba(29, 27, 23, 0.14);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.76);
  color: var(--ink);
  font-family: inherit;
}

textarea {
  resize: vertical;
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

.primary-button {
  min-height: 48px;
  border-radius: 16px;
  padding: 0 18px;
  font-weight: 700;
  border: 0;
  background: var(--accent);
  color: white;
}

.primary-button:disabled {
  opacity: 0.7;
  cursor: progress;
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

@media (max-width: 900px) {
  .tenant-page {
    padding: 20px;
  }

  .tenant-card {
    padding: 24px;
  }

  .actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
