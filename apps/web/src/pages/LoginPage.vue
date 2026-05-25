<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')

const buttonLabel = computed(() =>
  auth.status === 'loading' ? 'Signing in...' : 'Sign in',
)

async function onSubmit() {
  const success = await auth.login(email.value, password.value)
  password.value = ''

  if (success) {
    const invitationToken = sessionStorage.getItem('invitation_accept_token')
    const redirect =
      typeof route.query.redirect === 'string' && route.query.redirect.length > 0
        ? route.query.redirect
        : null

    if (invitationToken) {
      await router.push({ name: routeNames.invitationAccept })
      return
    }

    await router.push(redirect ?? { name: routeNames.home })
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <p class="eyebrow">EventOps Access</p>
      <h1>Sign in to your operations console.</h1>
      <p class="intro">
        Use your Supabase account to enter the workspace. Protected routes stay
        behind the backend-authenticated user flow.
      </p>

      <form class="auth-form" @submit.prevent="onSubmit">
        <label class="field">
          <span>Email</span>
          <input
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            placeholder="operator@eventops.local"
            required
          />
        </label>

        <label class="field">
          <span>Password</span>
          <input
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="Enter your password"
            required
          />
        </label>

        <p v-if="auth.error" class="feedback feedback-error">
          {{ auth.error }}
        </p>

        <button class="submit-button" type="submit" :disabled="auth.status === 'loading'">
          {{ buttonLabel }}
        </button>
      </form>

      <p v-if="auth.registrationMessage" class="feedback feedback-success">
        {{ auth.registrationMessage }}
      </p>

      <p class="footnote">
        Need an account?
        <RouterLink
          :to="{
            name: routeNames.register,
            query:
              typeof route.query.redirect === 'string'
                ? { redirect: route.query.redirect }
                : {},
          }"
        >
          Register
        </RouterLink>
      </p>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 20px;
}

.auth-panel {
  width: min(100%, 460px);
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
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 1.05;
}

.intro,
.footnote {
  margin: 16px 0 0;
  color: var(--muted);
}

.auth-form {
  margin-top: 28px;
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}

.field input {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.8);
  color: var(--ink);
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.submit-button {
  border: 0;
  border-radius: 999px;
  padding: 14px 18px;
  font-weight: 700;
  background: var(--accent);
  color: white;
}

.submit-button:disabled {
  opacity: 0.72;
  cursor: wait;
}

.feedback {
  margin: 18px 0 0;
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

.footnote a {
  color: var(--accent-strong);
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 640px) {
  .auth-panel {
    padding: 24px;
    border-radius: 22px;
  }
}
</style>
