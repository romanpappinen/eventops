<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const firstName = ref('')
const lastName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const localError = ref<string | null>(null)

const buttonLabel = computed(() =>
  auth.status === 'loading' ? 'Creating account...' : 'Create account',
)

async function onSubmit() {
  localError.value = null

  if (password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match.'
    return
  }

  const result = await auth.register(
    firstName.value,
    lastName.value,
    email.value,
    password.value,
  )
  password.value = ''
  confirmPassword.value = ''

  if (result === 'pending_confirmation') {
    await router.push({ name: routeNames.login })
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <p class="eyebrow">EventOps Access</p>
      <h1>Create your account.</h1>
      <p class="intro">
        Register through Supabase, then continue into the authenticated
        workspace when a session is available.
      </p>

      <form class="auth-form" @submit.prevent="onSubmit">
        <label class="field">
          <span>First name</span>
          <input
            v-model="firstName"
            type="text"
            autocomplete="given-name"
            placeholder="Ada"
            required
          />
        </label>

        <label class="field">
          <span>Last name</span>
          <input
            v-model="lastName"
            type="text"
            autocomplete="family-name"
            placeholder="Lovelace"
            required
          />
        </label>

        <label class="field">
          <span>Email</span>
          <input
            v-model="email"
            type="email"
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
            autocomplete="new-password"
            placeholder="Create a password"
            required
          />
        </label>

        <label class="field">
          <span>Confirm password</span>
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            placeholder="Repeat the password"
            required
          />
        </label>

        <p v-if="localError || auth.error" class="feedback feedback-error">
          {{ localError ?? auth.error }}
        </p>

        <button class="submit-button" type="submit" :disabled="auth.status === 'loading'">
          {{ buttonLabel }}
        </button>
      </form>

      <p class="footnote">
        Already registered?
        <RouterLink :to="{ name: routeNames.login }">Sign in</RouterLink>
      </p>

      <p v-if="auth.registrationMessage" class="feedback feedback-success">
        {{ auth.registrationMessage }}
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
  margin: 0;
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
