import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm } from '@/api/http'
import { authApi, hashLoginPassword } from '@/api/auth'

vi.mock('@/api/http', () => ({ postForm: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('auth API compatibility', () => {
  it('uses the password digest expected by the current backend login endpoint', () => {
    expect(hashLoginPassword('password')).toBe('5f4dcc3b5aa765d61d8327deb882cf99')
  })

  it('loads the signed-in profile from the protected backend endpoint', async () => {
    const profile = {
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    }
    vi.mocked(postForm).mockResolvedValue(profile)

    await expect(authApi.getUserInfo()).resolves.toEqual(profile)
    expect(postForm).toHaveBeenCalledWith('/account/getUserInfo', {})
  })

  it('sends the new raw password to the backend update endpoint', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await expect(authApi.updatePassword('NewPassword123')).resolves.toBeUndefined()
    expect(postForm).toHaveBeenCalledWith('/account/updatePassword', { password: 'NewPassword123' })
  })
})
