import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ post: vi.fn(), requestUse: vi.fn() }))
vi.mock('axios', () => ({ default: {
  create: vi.fn(() => ({ post: mocks.post, interceptors: { request: { use: mocks.requestUse } } })),
  isCancel: (error: { __CANCEL__?: boolean }) => Boolean(error?.__CANCEL__),
  isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError),
} }))

import { postForm, postMultipart, postDownload } from '@/api/http'
import { captureAuthRequestContext, useAuthStore } from '@/stores/auth'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'
import { API_UNAVAILABLE_EVENT } from '@/utils/apiEvents'

const session = (userId: string) => ({ token: '', userId, email: userId + '@example.com', nickName: userId, admin: false })
beforeEach(() => {
  window.sessionStorage.clear()
  window.dispatchEvent(new Event('pageshow'))
  setActivePinia(createPinia())
  useAuthStore().setSession(session('A'))
  mocks.post.mockReset()
})

describe('HTTP session ownership', () => {
  it('blocks an old request before dispatch rather than attaching the new account credentials', async () => {
    const context = captureAuthRequestContext()
    useAuthStore().setSession(session('B'))
    const headers = { set: vi.fn() }
    const interceptor = mocks.requestUse.mock.calls[0]![0]
    expect(() => interceptor({ headers, wetalkSession: context })).toThrow('登录会话已变化')
    expect(headers.set).not.toHaveBeenCalled()
  })

  it('drops a successful response after a different account has logged in', async () => {
    let resolve!: (value: unknown) => void
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = postForm('/account/getUserInfo', {}).catch((error: unknown) => error)
    useAuthStore().setSession(session('B'))
    resolve({ data: { status: 'success', code: 200, data: { userId: 'A' } } })
    expect(await pending).toMatchObject({ name: 'CanceledError' })
  })

  it('does not broadcast a late code 901 from the previous login of the same cookie account', async () => {
    let resolve!: (value: unknown) => void
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    try {
      mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done }))
      const pending = postForm('/account/getUserInfo', {}).catch((error: unknown) => error)
      useAuthStore().clearSession()
      useAuthStore().setSession(session('A'))
      resolve({ data: { status: 'error', code: 901, data: null } })
      expect(await pending).toMatchObject({ name: 'CanceledError' })
      expect(expired).not.toHaveBeenCalled()
    } finally { window.removeEventListener(AUTH_EXPIRED_EVENT, expired) }
  })

  it('does not navigate the new account for a stale HTTP 503 response', async () => {
    let reject!: (value: unknown) => void
    const unavailable = vi.fn()
    window.addEventListener(API_UNAVAILABLE_EVENT, unavailable)
    try {
      mocks.post.mockReturnValueOnce(new Promise((done, fail) => { reject = fail }))
      const pending = postMultipart('/account/saveUserInfo', new FormData()).catch((error: unknown) => error)
      useAuthStore().setSession(session('B'))
      reject(Object.assign(new Error('Unavailable'), { isAxiosError: true, response: { status: 503 } }))
      expect(await pending).toMatchObject({ name: 'CanceledError' })
      expect(unavailable).not.toHaveBeenCalled()
    } finally { window.removeEventListener(API_UNAVAILABLE_EVENT, unavailable) }
  })

  it('does not announce stale download authorization errors for a newer account', async () => {
    let resolve!: (value: unknown) => void
    const expired = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    try {
      mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done }))
      const pending = postDownload('/chat/downloadFile', { fileId: 1 }).catch((error: unknown) => error)
      useAuthStore().setSession(session('B'))
      resolve({ data: new Blob([JSON.stringify({ status: 'error', code: 901, data: null })], { type: 'application/json' }), headers: { 'content-type': 'application/json' } })
      expect(await pending).toMatchObject({ name: 'CanceledError' })
      expect(expired).not.toHaveBeenCalled()
    } finally { window.removeEventListener(AUTH_EXPIRED_EVENT, expired) }
  })

  it('keeps current 901 behavior when its event clears the session synchronously', async () => {
    const clear = () => useAuthStore().clearSession()
    window.addEventListener(AUTH_EXPIRED_EVENT, clear)
    mocks.post.mockResolvedValueOnce({ data: { status: 'error', code: 901, data: null } })
    try { await expect(postForm('/account/getUserInfo', {})).rejects.toMatchObject({ name: 'ApiError', code: 901 }) }
    finally { window.removeEventListener(AUTH_EXPIRED_EVENT, clear) }
  })

  it('profile refresh does not invalidate concurrent requests from the same session', async () => {
    let resolve!: (value: unknown) => void
    mocks.post.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const pending = postForm('/account/listSessions', {})
    const context = captureAuthRequestContext()
    expect(useAuthStore().applyProfile({ ...session('A'), nickName: 'Updated' }, context)).toBe(true)
    resolve({ data: { status: 'success', code: 200, data: [] } })
    await expect(pending).resolves.toEqual([])
  })
})
