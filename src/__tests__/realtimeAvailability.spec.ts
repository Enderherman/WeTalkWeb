import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), requestUse: vi.fn() }))
vi.mock('axios', () => ({ default: {
  create: vi.fn(() => ({ post: mocks.post, interceptors: { request: { use: mocks.requestUse } } })),
  isCancel: (error: { __CANCEL__?: boolean }) => Boolean(error?.__CANCEL__),
  isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError),
} }))

import App from '@/App.vue'
import { useAuthStore } from '@/stores/auth'
import { postForm } from '@/api/http'
import { authApi } from '@/api/auth'
import { createRealtimeClient } from '@/api/realtime'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  window.sessionStorage.clear()
  window.dispatchEvent(new Event('pageshow'))
  mocks.post.mockReset()
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function workspace() {
  const pinia = createPinia()
  const authStore = useAuthStore(pinia)
  authStore.setSession({ token: '', userId: 'U100', email: 'test@example.com', nickName: 'Test', admin: false })
  const errorImport = vi.fn(async () => ({ template: '<div>Service error</div>' }))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/chat', name: 'chat', component: { template: '<div data-testid="workspace">Chat and pending queue</div>' } },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/service-error', name: 'service-error', component: errorImport },
  ] })
  await router.push('/chat'); await router.isReady()
  wrapper = mount(App, { global: { plugins: [pinia, router] } })
  return { router, authStore, errorImport }
}
const networkFailure = () => Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' })

describe('realtime availability stays in the chat workspace', () => {
  it('keeps ticket network failures local even when the browser reports online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { router, errorImport } = await workspace()
    mocks.post.mockRejectedValue(networkFailure())
    const onStatus = vi.fn(), onError = vi.fn()
    const client = createRealtimeClient({ onStatus, onError, onMessage: vi.fn() }, { reconnectDelaysMs: [], location: { protocol: 'http:', host: 'localhost' } })
    try {
      await flushPromises()
      expect(onStatus).toHaveBeenLastCalledWith('offline')
      expect(onError).toHaveBeenCalled()
      expect(router.currentRoute.value.name).toBe('chat')
      expect(errorImport).not.toHaveBeenCalled()
    } finally { client.disconnect() }
  })

  it('does not import an unavailable error page when an existing workspace is explicitly offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { router, errorImport } = await workspace()
    mocks.post.mockRejectedValue(networkFailure())
    await expect(postForm('/account/getUserInfo', {})).rejects.toMatchObject({ name: 'ApiError' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('chat')
    expect(wrapper?.find('[data-testid="workspace"]').exists()).toBe(true)
    expect(errorImport).not.toHaveBeenCalled()
  })

  it('still expires an authenticated session when a background ticket receives 901', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { router, authStore } = await workspace()
    mocks.post.mockResolvedValue({ data: { status: 'error', code: 901, data: null } })
    await expect(authApi.createWebSocketTicket()).rejects.toMatchObject({ name: 'ApiError', code: 901 })
    await flushPromises()
    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('preserves global errors for normal online user operations and initial page requests', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { router, errorImport } = await workspace()
    mocks.post.mockRejectedValue(Object.assign(new Error('Unavailable'), { isAxiosError: true, response: { status: 503, data: { code: 503 } } }))
    await expect(postForm('/group/loadMyGroup', {})).rejects.toMatchObject({ name: 'ApiError', code: 503 })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('service-error')
    expect(errorImport).toHaveBeenCalledOnce()
  })

  it('keeps ticket service failures local without changing the next foreground request policy', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    const { router, errorImport } = await workspace()
    mocks.post.mockResolvedValue({ data: { status: 'error', code: 500, data: null } })
    await expect(authApi.createWebSocketTicket()).rejects.toMatchObject({ name: 'ApiError', code: 500 })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('chat')
    expect(errorImport).not.toHaveBeenCalled()
    await expect(postForm('/account/getUserInfo', {})).rejects.toMatchObject({ name: 'ApiError', code: 500 })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('service-error')
  })
})
