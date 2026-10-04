import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/App.vue'
import { ApiError, reportApiFailure, unwrapResponse } from '@/api/http'
import { API_UNAVAILABLE_EVENT } from '@/utils/apiEvents'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'
import { navigateWhilePageActive } from '@/utils/pageNavigationLifecycle'

let wrapper: VueWrapper | undefined
beforeEach(() => {
  window.sessionStorage.clear()
  window.dispatchEvent(new Event('pageshow'))
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  window.dispatchEvent(new Event('pageshow'))
  vi.restoreAllMocks()
})

async function mountAtChat() {
  const loadErrorView = vi.fn(async () => ({ template: '<div>Service error</div>' }))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/chat', name: 'chat', component: { template: '<div>Chat</div>' } },
    { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    { path: '/service-error', name: 'service-error', component: loadErrorView },
  ] })
  await router.push('/chat')
  await router.isReady()
  wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
  return { router, loadErrorView }
}
const interruptedRequest = () => Object.assign(new Error('Request aborted during navigation'), { isAxiosError: true, code: 'ECONNABORTED' })

describe('page navigation API error lifecycle', () => {
  it('does not import the service error route for XHR interrupted by beforeunload', async () => {
    const { router, loadErrorView } = await mountAtChat()
    window.dispatchEvent(new Event('beforeunload'))
    reportApiFailure(interruptedRequest())
    await flushPromises()
    expect(loadErrorView).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('chat')
  })

  it('ignores late unavailable events while leaving but resumes after BFCache pageshow', async () => {
    const { router, loadErrorView } = await mountAtChat()
    window.dispatchEvent(new Event('pagehide'))
    window.dispatchEvent(new Event(API_UNAVAILABLE_EVENT))
    await flushPromises()
    expect(loadErrorView).not.toHaveBeenCalled()
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    reportApiFailure(interruptedRequest())
    await flushPromises()
    expect(loadErrorView).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('service-error')
  })

  it('still reports a genuine network failure while a living page is merely hidden', async () => {
    const { router, loadErrorView } = await mountAtChat()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    window.dispatchEvent(new Event('visibilitychange'))
    reportApiFailure(interruptedRequest())
    await flushPromises()
    expect(loadErrorView).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.name).toBe('service-error')
  })

  it('suppresses only pending route-import rejection during actual navigation', async () => {
    let rejectImport!: (error: Error) => void
    const failure = new TypeError('Importing a module script failed.')
    const pendingImport = navigateWhilePageActive(() => new Promise<void>((resolve, reject) => { rejectImport = reject }))
    window.dispatchEvent(new Event('beforeunload'))
    rejectImport(failure)
    await expect(pendingImport).resolves.toBeUndefined()
    window.dispatchEvent(new Event('pageshow'))
    await expect(navigateWhilePageActive(() => Promise.reject(failure))).rejects.toBe(failure)
  })

  it('does not announce late wrapped server/auth failures while leaving and resumes after pageshow', () => {
    const unavailable = vi.fn(), expired = vi.fn()
    window.addEventListener(API_UNAVAILABLE_EVENT, unavailable)
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    try {
      window.dispatchEvent(new Event('beforeunload'))
      for (const code of [500, 901]) expect(() => unwrapResponse({ status: 'error', code, data: null })).toThrow(ApiError)
      expect(unavailable).not.toHaveBeenCalled()
      expect(expired).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('pageshow'))
      for (const code of [500, 901]) expect(() => unwrapResponse({ status: 'error', code, data: null })).toThrow(ApiError)
      expect(unavailable).toHaveBeenCalledOnce()
      expect(expired).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(API_UNAVAILABLE_EVENT, unavailable)
      window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
    }
  })
})
