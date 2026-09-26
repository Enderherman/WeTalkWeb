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
})
