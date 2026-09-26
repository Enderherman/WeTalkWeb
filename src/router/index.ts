import { createRouter, createWebHistory } from 'vue-router'
import { readStoredSession } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: { name: 'chat' } },
    { path: '/login', name: 'login', component: () => import('@/views/AuthView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/AuthView.vue') },
    { path: '/chat', name: 'chat', component: () => import('@/views/ChatHome.vue') },
    { path: '/admin/users', name: 'admin-users', component: () => import('@/views/AdminUsersView.vue'), meta: { adminOnly: true } },
    { path: '/admin/groups', name: 'admin-groups', component: () => import('@/views/AdminGroupsView.vue'), meta: { adminOnly: true } },
    { path: '/admin/settings', name: 'admin-settings', component: () => import('@/views/AdminSettingsView.vue'), meta: { adminOnly: true } },
    { path: '/about', name: 'about', component: () => import('@/views/AboutView.vue') },
    { path: '/service-error', name: 'service-error', component: () => import('@/views/ServiceErrorView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
})

router.beforeEach((to) => {
  const session = readStoredSession()
  const isAuthenticated = Boolean(session?.userId)
  const isAuthPage = to.name === 'login' || to.name === 'register'
  const isPublicPage = isAuthPage || to.name === 'not-found' || to.name === 'service-error'

  if (!isAuthenticated && !isPublicPage) return { name: 'login' }
  if (isAuthenticated && isAuthPage) return { name: 'chat' }
  if (to.meta.adminOnly && !session?.admin) return { name: 'chat' }
})

export default router
