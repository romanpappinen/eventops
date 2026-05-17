<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import BlankLayout from './layouts/BlankLayout.vue'
import DefaultLayout from './layouts/DefaultLayout.vue'

const route = useRoute()

const layoutComponent = computed(() =>
  route.meta.layout === 'blank' ? BlankLayout : DefaultLayout,
)
</script>

<template>
  <component :is="layoutComponent">
    <RouterView />
  </component>
</template>
