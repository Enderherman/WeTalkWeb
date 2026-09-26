import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

const mocks = vi.hoisted(() => ({ post: vi.fn(), requestUse: vi.fn() }))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ post: mocks.post, interceptors: { request: { use: mocks.requestUse } } })),
    isAxiosError: vi.fn(() => false),
  },
}))

import { ApiError, postDownload } from '@/api/http'

beforeEach(() => vi.clearAllMocks())

describe('binary download helper', () => {
  it('requests a full binary response with the authenticated API client', async () => {
    const blob = new Blob(['file bytes'], { type: 'application/octet-stream' })
    mocks.post.mockResolvedValue({
      data: blob,
      headers: { 'content-type': 'application/octet-stream' },
    })

    await expect(postDownload('/chat/downloadFile', { fileId: 42, showCover: false })).resolves.toBe(blob)

    const [path, body, config] = mocks.post.mock.calls[0]!
    expect(path).toBe('/chat/downloadFile')
    expect(body.get('fileId')).toBe('42')
    expect(body.get('showCover')).toBe('false')
    expect(config.responseType).toBe('blob')
    expect(config.timeout).toBe(0)
  })

  it('unwraps a body-level authorization error returned as a JSON Blob', async () => {
    const body = new Blob([
      JSON.stringify({ status: 'error', code: 600, message: '当前账号无权下载此文件', data: null }),
    ], { type: 'application/json' })
    mocks.post.mockResolvedValue({ data: body, headers: { 'content-type': 'application/json' } })

    await expect(postDownload('/chat/downloadFile', { fileId: 42, showCover: false })).rejects.toMatchObject({
      name: 'ApiError',
      code: 600,
      message: '当前账号无权下载此文件',
    })
  })

  it('announces an expired session when the download endpoint returns code 901 in a Blob', async () => {
    const listener = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, listener)
    mocks.post.mockResolvedValue({
      data: new Blob([
        JSON.stringify({ status: 'error', code: 901, message: '登录超时', data: null }),
      ], { type: 'application/json' }),
      headers: { 'content-type': 'application/json' },
    })
    try {
      await expect(postDownload('/chat/downloadFile', { fileId: 42, showCover: false })).rejects.toMatchObject({
        name: 'ApiError',
        code: 901,
      })
      expect(listener).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener(AUTH_EXPIRED_EVENT, listener)
    }
  })
})
