<script setup lang="ts">
import AppSidebar from '../components/AppSidebar.vue'
</script>

<template>
  <div class="default-layout">
    <AppSidebar />
    <main class="default-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.default-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}

.default-content {
  min-width: 0;
}

@media (max-width: 900px) {
  .default-layout {
    grid-template-columns: 1fr;
  }
}
</style>
