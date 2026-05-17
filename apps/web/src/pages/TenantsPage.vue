<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'
import { useTenantsStore } from '../stores/tenants'

const auth = useAuthStore()
const tenants = useTenantsStore()

const hasTenants = computed(() => tenants.items.length > 0)

onMounted(async () => {
  const accessToken = auth.session?.access_token

  if (!accessToken) {
    return
  }

  if (tenants.items.length > 0) {
    return
  }

  try {
    await tenants.fetchTenants(accessToken)
  } catch {
    return
  }
})
</script>

<template>
  <section class="tenant-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Tenants</p>
        <h1>Workspaces you can access</h1>
        <p class="intro">
          Tenant data is loaded only through the authenticated API. Actions here stay scoped to
          memberships returned for your current user.
        </p>
      </div>

      <RouterLink class="primary-link" :to="{ name: routeNames.tenantCreate }">
        Create tenant
      </RouterLink>
    </header>

    <p v-if="tenants.error" class="feedback feedback-error">{{ tenants.error }}</p>

    <div v-if="tenants.status === 'loading'" class="panel">
      <p>Loading tenants...</p>
    </div>

    <div v-else-if="!hasTenants" class="panel empty-state">
      <h2>No tenants yet</h2>
      <p>Create your first tenant to start isolating data and inviting members.</p>
      <RouterLink class="primary-link" :to="{ name: routeNames.tenantCreate }">
        Create your first tenant
      </RouterLink>
    </div>

    <div v-else class="panel table-panel">
      <table class="tenant-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Description</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tenant in tenants.items" :key="tenant.id">
            <td>{{ tenant.name }}</td>
            <td><code>{{ tenant.slug }}</code></td>
            <td>{{ tenant.description ?? 'No description' }}</td>
            <td>{{ tenant.plan }}</td>
            <td>{{ tenant.status }}</td>
            <td>{{ tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : 'Unknown' }}</td>
            <td>
              <RouterLink
                class="table-link"
                :to="{ name: routeNames.tenantEdit, params: { tenantId: tenant.id } }"
              >
                Edit
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.tenant-page {
  min-height: 100vh;
  padding: 32px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
  margin-bottom: 24px;
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
  max-width: 60ch;
  color: var(--muted);
}

.panel {
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 24px;
  background: rgba(255, 250, 242, 0.82);
  box-shadow: var(--shadow);
}

.table-panel {
  overflow-x: auto;
}

.empty-state {
  display: grid;
  gap: 14px;
  justify-items: start;
}

.tenant-table {
  width: 100%;
  border-collapse: collapse;
}

.tenant-table th,
.tenant-table td {
  padding: 16px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(29, 27, 23, 0.08);
  vertical-align: top;
}

.tenant-table th {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.primary-link,
.table-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  text-decoration: none;
  font-weight: 700;
}

.primary-link {
  min-height: 48px;
  padding: 0 18px;
  background: var(--accent);
  color: white;
}

.table-link {
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(29, 27, 23, 0.08);
}

.feedback {
  margin: 0 0 20px;
  padding: 14px 16px;
  border-radius: 16px;
  font-weight: 600;
}

.feedback-error {
  color: var(--danger);
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.16);
}

@media (max-width: 900px) {
  .tenant-page {
    padding: 20px;
  }

  .page-header {
    flex-direction: column;
  }
}
</style>
