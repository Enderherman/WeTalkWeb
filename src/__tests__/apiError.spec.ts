import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '@/App.vue'
import ServiceErrorView from '@/views/ServiceErrorView.vue'
import appRouter from '@/router'
import { API_UNAVAILABLE_EVENT } from '@/utils/apiEvents'

const ChatStub = { template: '<div>聊天页面</div>' }
const LoginStub = { template: '<div>登录页面</div>' }

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: ChatStub },
      { path: '/login', name: 'login', component: LoginStub },
      { path: '/service-error', name: 'service-error', component: ServiceErrorView },
    ],
  })
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('global API unavailable page', () => {
  it('opens from the current route and retries that route', async () => {
    const pinia = createPinia()
    const router = createTestRouter()
    await router.push('/chat?session=S100')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    window.dispatchEvent(new Event(API_UNAVAILABLE_EVENT))
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('service-error')
    expect(router.currentRoute.value.query.from).toBe('/chat?session=S100')
    expect(wrapper.get('[data-testid="api-unavailable-page"]').text()).toContain('WeTalk 暂时无法连接')
    expect(wrapper.text()).not.toContain('internal detail')

    await wrapper.get('[data-testid="service-error-retry"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/chat?session=S100')
    wrapper.unmount()
  })

  it('rejects an external retry URL and routes unsigned users to login', async () => {
    const pinia = createPinia()
    const router = createTestRouter()
    await router.push('/service-error?from=https%3A%2F%2Fevil.example')
    await router.isReady()
    const wrapper = mount(ServiceErrorView, { global: { plugins: [pinia, router] } })

    expect(wrapper.get('[data-testid="service-error-retry"]').attributes('href')).toBe('/login')
    expect(wrapper.get('[data-testid="service-error-retry"]').text()).toBe('前往登录')
    await wrapper.get('[data-testid="service-error-retry"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('keeps the service error route public for unsigned visitors', async () => {
    await appRouter.push('/service-error?from=%2Flogin')

    expect(appRouter.currentRoute.value.name).toBe('service-error')
  })
})
