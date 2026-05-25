<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { acceptInvitation, getInvitationAcceptDetails, type InvitationAcceptDetails } from '../lib/api'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const invitation = ref<InvitationAcceptDetails | null>(null)
const loading = ref(true)
const accepting = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const storedToken = ref('')

const token = computed(() => storedToken.value)
const isAuthenticated = computed(() => auth.isAuthenticated)
const isPending = computed(() => invitation.value?.status === 'pending')
const canAccept = computed(() => isAuthenticated.value && isPending.value && !accepting.value)

const redirectQuery = computed(() => ({ redirect: '/accept-invite' }))

function syncTokenFromLocation() {
  const queryToken = typeof route.query.token === 'string' ? route.query.token : ''
  const sessionToken = sessionStorage.getItem('invitation_accept_token') ?? ''

  if (queryToken) {
    sessionStorage.setItem('invitation_accept_token', queryToken)
    storedToken.value = queryToken
    void router.replace({ name: routeNames.invitationAccept })
    return
  }

  storedToken.value = sessionToken
}

async function loadInvitation() {
  if (!token.value) {
    invitation.value = null
    error.value = 'Invitation token is missing.'
    loading.value = false
    return
  }

  loading.value = true
  error.value = null

  try {
    if (!auth.session?.access_token) {
      invitation.value = null
      loading.value = false
      return
    }

    invitation.value = await getInvitationAcceptDetails(auth.session.access_token, token.value)
  } catch (loadError) {
    invitation.value = null
    error.value = loadError instanceof Error ? loadError.message : 'Failed to load invitation'
  } finally {
    loading.value = false
  }
}

async function onAccept() {
  if (!auth.session?.access_token || !token.value) {
    return
  }

  accepting.value = true
  error.value = null

  try {
    await acceptInvitation(auth.session.access_token, token.value)
    successMessage.value = 'Invitation accepted. You can now access the tenant.'
    sessionStorage.removeItem('invitation_accept_token')
    await loadInvitation()
    await router.push({ name: routeNames.tenants })
  } catch (acceptError) {
    error.value = acceptError instanceof Error ? acceptError.message : 'Failed to accept invitation'
  } finally {
    accepting.value = false
  }
}

onMounted(async () => {
  await auth.initialize()
  syncTokenFromLocation()
  await loadInvitation()
})

watch(
  () => route.query.token,
  async () => {
    syncTokenFromLocation()
    await loadInvitation()
  },
)
</script>

<template>
  <main class="invite-page">
    <section class="invite-panel">
      <p class="eyebrow">Invitation</p>
      <h1>Join your workspace.</h1>

      <p v-if="loading" class="intro">Loading invitation details...</p>

      <template v-else>
        <p v-if="error" class="feedback feedback-error">
          {{ error }}
        </p>

        <template v-else-if="!isAuthenticated && token">
          <p class="intro">Sign in with the invited email address to review and accept this invitation.</p>

          <div class="actions">
            <RouterLink class="primary-link" :to="{ name: routeNames.login, query: redirectQuery }">
              Sign in to accept
            </RouterLink>
            <RouterLink class="secondary-link" :to="{ name: routeNames.register, query: redirectQuery }">
              Create account
            </RouterLink>
          </div>
        </template>

        <template v-else-if="invitation">
          <p class="intro">
            Tenant:
            <strong>{{ invitation.tenantName }}</strong>
          </p>
          <p class="intro">
            Role:
            <strong>{{ invitation.role }}</strong>
          </p>
          <p class="intro">
            Status:
            <strong>{{ invitation.status }}</strong>
          </p>
          <p v-if="invitation.expiresAt" class="intro">
            Expires:
            <strong>{{ new Date(invitation.expiresAt).toLocaleString() }}</strong>
          </p>

          <p v-if="successMessage" class="feedback feedback-success">
            {{ successMessage }}
          </p>

          <div v-if="canAccept" class="actions">
            <button class="primary-button" type="button" :disabled="accepting" @click="onAccept">
              {{ accepting ? 'Accepting invitation...' : 'Accept invitation' }}
            </button>
          </div>

          <p v-else-if="invitation.status === 'accepted'" class="feedback feedback-success">
            This invitation has already been accepted.
          </p>
          <p v-else-if="invitation.status === 'expired'" class="feedback feedback-error">
            This invitation has expired.
          </p>
          <p v-else-if="invitation.status === 'revoked'" class="feedback feedback-error">
            This invitation has been revoked.
          </p>
          <p v-else-if="invitation.status === 'archived'" class="feedback feedback-error">
            This tenant has been archived.
          </p>
        </template>
      </template>
    </section>
  </main>
</template>

<style scoped>
.invite-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
}

.invite-panel {
  width: min(100%, 520px);
  background: color-mix(in srgb, var(--paper) 88%, white);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 32px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(18px);
}

.eyebrow {
  margin: 0 0 12px;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  font-weight: 700;
}

h1 {
  margin: 0 0 16px;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1.05;
}

.intro {
  margin: 10px 0 0;
  color: var(--muted);
}

.actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.primary-link,
.secondary-link,
.primary-button {
  border-radius: 999px;
  padding: 14px 18px;
  font-weight: 700;
  text-decoration: none;
}

.primary-link,
.primary-button {
  border: 0;
  background: var(--accent);
  color: white;
}

.secondary-link {
  border: 1px solid var(--line);
  color: var(--ink);
}

.feedback {
  margin: 20px 0 0;
  border-radius: 16px;
  padding: 12px 14px;
}

.feedback-error {
  background: rgba(180, 35, 24, 0.08);
  color: var(--danger);
}

.feedback-success {
  background: rgba(21, 111, 72, 0.1);
  color: var(--success);
}

@media (max-width: 640px) {
  .invite-panel {
    padding: 24px;
    border-radius: 22px;
  }
}
</style>
