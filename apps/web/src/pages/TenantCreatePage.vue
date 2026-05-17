<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'
import { useTenantsStore } from '../stores/tenants'

const auth = useAuthStore()
const tenants = useTenantsStore()
const router = useRouter()

const name = ref('')
const description = ref('')
const slug = ref('')
const localError = ref<string | null>(null)

const previewSlug = computed(() => {
  const source = slug.value.trim() || name.value.trim()

  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
})

async function onSubmit() {
  localError.value = null

  const accessToken = auth.session?.access_token

  if (!accessToken) {
    localError.value = 'Your session is no longer available. Sign in again.'
    return
  }

  try {
    const tenant = await tenants.createTenant(accessToken, {
      name: name.value,
      description: description.value || undefined,
      slug: slug.value || undefined,
    })

    await router.push({
      name: routeNames.tenantEdit,
      params: { tenantId: tenant.id },
      query: { created: '1' },
    })
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Failed to create tenant'
  }
}
</script>

<template>
  <section class="tenant-page">
    <div class="tenant-card">
      <p class="eyebrow">Create tenant</p>
      <h1>Open a new workspace</h1>
      <p class="intro">
        The API will create the tenant and add your authenticated user as the active owner.
      </p>

      <form class="tenant-form" @submit.prevent="onSubmit">
        <label>
          <span>Name</span>
          <input v-model="name" type="text" maxlength="100" required />
        </label>

        <label>
          <span>Description</span>
          <textarea v-model="description" rows="4" maxlength="500" />
        </label>

        <label>
          <span>Slug</span>
          <input v-model="slug" type="text" maxlength="50" placeholder="optional-custom-slug" />
        </label>

        <p class="slug-preview">
          Slug preview:
          <code>{{ previewSlug || 'generated-from-name' }}</code>
        </p>

        <p v-if="localError || tenants.error" class="feedback feedback-error">
          {{ localError ?? tenants.error }}
        </p>

        <div class="actions">
          <button class="primary-button" type="submit" :disabled="tenants.status === 'saving'">
            {{ tenants.status === 'saving' ? 'Creating tenant...' : 'Create tenant' }}
          </button>
          <RouterLink class="secondary-link" :to="{ name: routeNames.tenants }">
            Cancel
          </RouterLink>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.tenant-page {
  min-height: 100vh;
  padding: 32px;
}

.tenant-card {
  max-width: 760px;
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

h1 {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3rem);
}

.intro {
  margin: 16px 0 0;
  color: var(--muted);
  max-width: 56ch;
}

.tenant-form {
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
}

textarea {
  resize: vertical;
}

.slug-preview {
  margin: 0;
  color: var(--muted);
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

  .actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
