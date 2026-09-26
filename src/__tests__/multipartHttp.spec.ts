import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), requestUse: vi.fn() }))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ post: mocks.post, interceptors: { request: { use: mocks.requestUse } } })),
    isAxiosError: vi.fn(() => false),
  },
}))

import { postMultipart } from '@/api/http'

beforeEach(() => vi.clearAllMocks())

describe('multipart API helper', () => {
  it('passes FormData through Axios without overriding its boundary header', async () => {
    const body = new FormData()
    const avatar = new File(['png data'], 'avatar.png', { type: 'image/png' })
    body.set('avatarFile', avatar)
    mocks.post.mockResolvedValue({ data: { status: 'success', code: 200, data: null } })

    await expect(postMultipart('/group/saveGroup', body)).resolves.toBeNull()
    expect(mocks.post).toHaveBeenCalledWith('/group/saveGroup', body)
  })

  it('supports long file uploads and reports byte progress as a percentage', async () => {
    const body = new FormData()
    const file = new File(['content'], 'notes.txt', { type: 'text/plain' })
    body.set('file', file)
    const onUploadProgress = vi.fn()
    mocks.post.mockResolvedValue({ data: { status: 'success', code: 200, data: 'uploaded' } })

    await expect(postMultipart('/chat/uploadFile', body, { timeoutMs: 0, onUploadProgress })).resolves.toBe('uploaded')

    const [path, sentBody, options] = mocks.post.mock.calls[0]!
    expect(path).toBe('/chat/uploadFile')
    expect(sentBody).toBe(body)
    expect(options.timeout).toBe(0)
    options.onUploadProgress({ loaded: 25, total: 100 })
    expect(onUploadProgress).toHaveBeenCalledWith(25)
  })
})
