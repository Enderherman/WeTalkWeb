import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import appRouter from '@/router'
import NotFoundView from '@/views/NotFoundView.vue'
import { useAuthStore } from '@/stores/auth'

function createPageRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/not-found', name: 'not-found', component: NotFoundView },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
    ],
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('not found page', () => {
  it('resolves unknown paths to the app 404 route instead of the chat page', () => {
    expect(appRouter.resolve('/this-page-does-not-exist').name).toBe('not-found')
  })

  it('keeps signed-out visitors on the 404 page for an unknown path', async () => {
    await appRouter.push('/this-page-does-not-exist')

    expect(appRouter.currentRoute.value.name).toBe('not-found')
  })

  it('shows a login action to signed-out visitors', async () => {
    const pinia = createPinia()
    const router = createPageRouter()
    await router.push('/not-found')
    const wrapper = mount(NotFoundView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('404 · 页面不存在')
    expect(wrapper.get('.not-found-action').text()).toBe('前往登录')
    expect(wrapper.get('.not-found-action').attributes('href')).toBe('/login')
  })

  it('sends authenticated visitors back to chat', async () => {
    const pinia = createPinia()
    useAuthStore(pinia).setSession({
      token: 'web-token',
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    })
    const router = createPageRouter()
    await router.push('/not-found')
    const wrapper = mount(NotFoundView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.get('.not-found-action').text()).toBe('返回聊天')
    expect(wrapper.get('.not-found-action').attributes('href')).toBe('/chat')
  })
})
