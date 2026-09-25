import { createRouter, createWebHistory } from 'vue-router'
import { readStoredSession } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: { name: 'chat' } },
    { path: '/login', name: 'login', component: () => import('@/views/AuthView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/AuthView.vue') },
    { path: '/chat', name: 'chat', component: () => import('@/views/ChatHome.vue') },
    { path: '/:pathMatch(.*)*', redirect: { name: 'chat' } },
  ],
})

router.beforeEach((to) => {
  const isAuthenticated = Boolean(readStoredSession()?.token)
  const isAuthPage = to.name === 'login' || to.name === 'register'

  if (!isAuthenticated && !isAuthPage) return { name: 'login' }
  if (isAuthenticated && isAuthPage) return { name: 'chat' }
})

export default router
