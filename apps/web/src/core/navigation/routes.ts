import type { RouteRecordRaw } from 'vue-router'
import HomePage from '../../pages/HomePage.vue'
import InvitationAcceptPage from '../../pages/InvitationAcceptPage.vue'
import LoginPage from '../../pages/LoginPage.vue'
import RegisterPage from '../../pages/RegisterPage.vue'
import TenantCreatePage from '../../pages/TenantCreatePage.vue'
import TenantEditPage from '../../pages/TenantEditPage.vue'
import TenantsPage from '../../pages/TenantsPage.vue'

export const routeNames = {
  home: 'home',
  login: 'login',
  register: 'register',
  invitationAccept: 'invitationAccept',
  tenants: 'tenants',
  tenantCreate: 'tenantCreate',
  tenantEdit: 'tenantEdit',
} as const

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: routeNames.home,
    component: HomePage,
    meta: {
      layout: 'default',
      requiresAuth: true,
    },
  },
  {
    path: '/tenants',
    name: routeNames.tenants,
    component: TenantsPage,
    meta: {
      layout: 'default',
      requiresAuth: true,
    },
  },
  {
    path: '/tenants/new',
    name: routeNames.tenantCreate,
    component: TenantCreatePage,
    meta: {
      layout: 'default',
      requiresAuth: true,
    },
  },
  {
    path: '/tenants/:tenantId/edit',
    name: routeNames.tenantEdit,
    component: TenantEditPage,
    meta: {
      layout: 'default',
      requiresAuth: true,
    },
  },
  {
    path: '/accept-invite',
    name: routeNames.invitationAccept,
    component: InvitationAcceptPage,
    meta: {
      layout: 'blank',
    },
  },
  {
    path: '/login',
    name: routeNames.login,
    component: LoginPage,
    meta: {
      layout: 'blank',
      guestOnly: true,
    },
  },
  {
    path: '/register',
    name: routeNames.register,
    component: RegisterPage,
    meta: {
      layout: 'blank',
      guestOnly: true,
    },
  },
]
