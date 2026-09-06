<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const email = ref('')
const submitted = ref(false)

const buttonLabel = computed(() =>
  auth.status === 'loading' ? 'Sending link...' : 'Send reset link',
)

async function onSubmit() {
  const success = await auth.requestPasswordReset(email.value)
  submitted.value = success
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <p class="eyebrow">EventOps Access</p>
      <h1>Reset your password.</h1>
      <p class="intro">
        Enter the email address for your account and we'll send you a link to
        set a new password.
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

        <p v-if="auth.error" class="feedback feedback-error">
          {{ auth.error }}
        </p>

        <button class="submit-button" type="submit" :disabled="auth.status === 'loading'">
          {{ buttonLabel }}
        </button>
      </form>

      <p v-if="submitted && auth.passwordResetMessage" class="feedback feedback-success">
        {{ auth.passwordResetMessage }}
      </p>

      <p class="footnote">
        Remembered your password?
        <RouterLink :to="{ name: routeNames.login }"> Sign in </RouterLink>
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
