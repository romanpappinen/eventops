import { createRouter, createWebHistory } from 'vue-router'
import { routes, routeNames } from '../core/navigation/routes'
import { pinia } from '../store'
import { useAuthStore } from '../stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to: { meta: Record<string, unknown> }) => {
  const auth = useAuthStore(pinia)

  await auth.initialize()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: routeNames.login }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: routeNames.home }
  }

  return true
})
