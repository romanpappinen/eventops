import { createRouter, createWebHistory } from 'vue-router'
import { routes, routeNames } from '../core/navigation/routes'
import { pinia } from '../store'
import { useAuthStore } from '../stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)

  await auth.initialize()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: routeNames.login, query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated) {
    const redirect =
      typeof to.query.redirect === 'string' && to.query.redirect.length > 0
        ? to.query.redirect
        : null

    return redirect ?? { name: routeNames.home }
  }

  return true
})
