import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, reportApiFailure, unwrapResponse } from '@/api/http'
import { API_UNAVAILABLE_EVENT } from '@/utils/apiEvents'
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

  it('routes wrapped HTTP 5xx business responses to the unavailable page', () => {
    const listener = vi.fn()
    window.addEventListener(API_UNAVAILABLE_EVENT, listener)
    try {
      expect(() => unwrapResponse({ status: 'error', code: 500, message: 'internal detail', data: null })).toThrowError(
        ApiError,
      )
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(API_UNAVAILABLE_EVENT, listener)
    }
  })

  it('announces an unavailable API for network failures and server errors', () => {
    const listener = vi.fn()
    window.addEventListener(API_UNAVAILABLE_EVENT, listener)
    try {
      reportApiFailure(Object.assign(new Error('network down'), { isAxiosError: true }))
      reportApiFailure(Object.assign(new Error('server error'), {
        isAxiosError: true,
        response: { status: 503, data: { code: 503, message: 'internal detail' } },
      }))

      expect(listener).toHaveBeenCalledTimes(2)
    } finally {
      window.removeEventListener(API_UNAVAILABLE_EVENT, listener)
    }
  })

  it('keeps business and client errors out of the global unavailable page', () => {
    const unavailableListener = vi.fn()
    const expiredListener = vi.fn()
    window.addEventListener(API_UNAVAILABLE_EVENT, unavailableListener)
    window.addEventListener(AUTH_EXPIRED_EVENT, expiredListener)
    try {
      reportApiFailure(Object.assign(new Error('not found'), {
        isAxiosError: true,
        response: { status: 404, data: { code: 404, message: 'not found' } },
      }))
      reportApiFailure(Object.assign(new Error('expired'), {
        isAxiosError: true,
        response: { status: 401, data: { code: 901, message: 'expired' } },
      }))
      expect(() => unwrapResponse({ status: 'error', code: 600, message: 'business validation', data: null })).toThrowError(
        ApiError,
      )

      expect(unavailableListener).not.toHaveBeenCalled()
      expect(expiredListener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(API_UNAVAILABLE_EVENT, unavailableListener)
      window.removeEventListener(AUTH_EXPIRED_EVENT, expiredListener)
    }
  })
})
