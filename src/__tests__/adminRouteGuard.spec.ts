import { beforeEach, describe, expect, it } from 'vitest'
import router from '@/router'

const sessionKey = 'wetalk-web.session.v1'
const adminRoutes = [
  ['/admin/users', 'admin-users'],
  ['/admin/groups', 'admin-groups'],
  ['/admin/settings', 'admin-settings'],
  ['/admin/beauty-accounts', 'admin-beauty-accounts'],
] as const

beforeEach(async () => {
  window.sessionStorage.clear()
  await router.push('/login')
})

describe('administrator routes', () => {
  it.each(adminRoutes)('redirects a regular account away from %s', async (path) => {
    window.sessionStorage.setItem(sessionKey, JSON.stringify({ token: '', userId: 'U100', admin: false }))

    await router.push(path)

    expect(router.currentRoute.value.name).toBe('chat')
  })

  it.each(adminRoutes)('allows an administrator to open %s', async (path, routeName) => {
    window.sessionStorage.setItem(sessionKey, JSON.stringify({ token: '', userId: 'U900', admin: true }))

    await router.push(path)

    expect(router.currentRoute.value.name).toBe(routeName)
  })
})
