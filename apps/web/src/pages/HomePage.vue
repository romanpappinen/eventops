<script setup lang="ts">
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
</script>

<template>
  <section class="home-page">
    <div class="home-card">
      <p class="eyebrow">Home</p>
      <h1>{{ auth.greeting }}</h1>
      <p class="intro">
        You are inside the authenticated application shell. Route guards are
        active and backend user data has been loaded.
      </p>

      <dl class="profile-grid">
        <div>
          <dt>User ID</dt>
          <dd>{{ auth.user?.id ?? 'Unavailable' }}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{{ auth.user?.email ?? auth.supabaseUser?.email ?? 'Unavailable' }}</dd>
        </div>
        <div>
          <dt>Full name</dt>
          <dd>{{ auth.user?.fullName ?? 'Not set' }}</dd>
        </div>
        <div>
          <dt>Avatar URL</dt>
          <dd class="truncate">{{ auth.user?.avatarUrl ?? 'Not set' }}</dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: 32px;
}

.home-card {
  max-width: 860px;
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
  line-height: 1.05;
}

.intro {
  margin: 16px 0 0;
  color: var(--muted);
  max-width: 58ch;
}

.profile-grid {
  margin: 28px 0 0;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-grid div {
  border-radius: 18px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.64);
  border: 1px solid rgba(29, 27, 23, 0.08);
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

.truncate {
  overflow-wrap: anywhere;
}

@media (max-width: 900px) {
  .home-page {
    padding: 20px;
  }

  .home-card {
    padding: 24px;
  }

  .profile-grid {
    grid-template-columns: 1fr;
  }
}
</style>
