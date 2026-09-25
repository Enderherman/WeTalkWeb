import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, unwrapResponse } from '@/api/http'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

describe('authenticated API responses', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns successful response data', () => {
    expect(unwrapResponse({ status: 'success', code: 200, data: { ready: true } })).toEqual({ ready: true })
  })

  it('announces an expired session when the backend returns code 901', () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, listener)
    try {
      expect(() => unwrapResponse({ status: 'error', code: 901, message: '登录超时', data: null })).toThrowError(
        ApiError,
      )
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener)
    }
  })
})
