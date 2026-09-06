<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const loading = ref(true)
const password = ref('')
const confirmPassword = ref('')
const localError = ref<string | null>(null)

const hasRecoverySession = computed(() => Boolean(auth.session))
const buttonLabel = computed(() =>
  auth.status === 'loading' ? 'Updating password...' : 'Set new password',
)

async function onSubmit() {
  localError.value = null

  if (password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match.'
    return
  }

  const success = await auth.updatePassword(password.value)
  password.value = ''
  confirmPassword.value = ''

  if (success) {
    await auth.logout()
    auth.passwordResetMessage = 'Password updated. Sign in with your new password.'
    await router.push({ name: routeNames.login })
  }
}

onMounted(async () => {
  await auth.initialize()
  loading.value = false
})
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <p class="eyebrow">EventOps Access</p>
      <h1>Set a new password.</h1>

      <p v-if="loading" class="intro">Checking your reset link...</p>

      <template v-else-if="!hasRecoverySession">
        <p class="feedback feedback-error">
          This reset link is invalid or has expired.
        </p>
        <p class="footnote">
          <RouterLink :to="{ name: routeNames.forgotPassword }"> Request a new link </RouterLink>
        </p>
      </template>

      <template v-else>
        <p class="intro">Choose a new password for your account.</p>

        <form class="auth-form" @submit.prevent="onSubmit">
          <label class="field">
            <span>New password</span>
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
      </template>
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
