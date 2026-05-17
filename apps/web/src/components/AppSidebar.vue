<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { routeNames } from '../core/navigation/routes'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const userLabel = computed(
  () => auth.user?.fullName ?? auth.user?.email ?? auth.supabaseUser?.email ?? 'Operator',
)

async function handleLogout() {
  await auth.logout()
  await router.push({ name: routeNames.login })
}
</script>

<template>
  <aside class="sidebar">
    <div>
      <p class="sidebar-eyebrow">EventOps</p>
      <h1 class="sidebar-title">Control panel</h1>
      <p class="sidebar-user">{{ userLabel }}</p>
    </div>

    <nav class="sidebar-nav" aria-label="Primary">
      <RouterLink class="nav-link" :to="{ name: routeNames.home }">
        Home
      </RouterLink>
      <RouterLink class="nav-link" :to="{ name: routeNames.tenants }">
        Tenants
      </RouterLink>
    </nav>

    <button class="logout-button" type="button" @click="handleLogout">
      Logout
    </button>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 22px;
  border-right: 1px solid rgba(29, 27, 23, 0.12);
  background:
    linear-gradient(180deg, rgba(255, 250, 242, 0.94) 0%, rgba(243, 232, 217, 0.92) 100%);
  backdrop-filter: blur(18px);
}

.sidebar-eyebrow {
  margin: 0 0 10px;
  color: var(--accent-strong);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 12px;
  font-weight: 700;
}

.sidebar-title {
  margin: 0;
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 2rem;
  line-height: 1;
}

.sidebar-user {
  margin: 14px 0 0;
  color: var(--muted);
}

.sidebar-nav {
  display: grid;
  gap: 10px;
}

.nav-link,
.logout-button {
  border-radius: 16px;
  padding: 12px 14px;
  font-weight: 700;
}

.nav-link {
  color: var(--ink);
  text-decoration: none;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(29, 27, 23, 0.08);
}

.nav-link.router-link-active {
  background: var(--accent);
  color: white;
  border-color: transparent;
}

.logout-button {
  border: 1px solid rgba(157, 60, 28, 0.22);
  background: transparent;
  color: var(--accent-strong);
}

@media (max-width: 900px) {
  .sidebar {
    border-right: 0;
    border-bottom: 1px solid rgba(29, 27, 23, 0.12);
  }
}
</style>
