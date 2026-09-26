import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm } from '@/api/http'
import { appUpdateApi } from '@/api/appUpdates'

vi.mock('@/api/http', () => ({ postForm: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('web release notice API', () => {
  it('checks the current web version without accepting a caller-supplied graylist identity', async () => {
    const notice = {
      id: 18,
      version: '0.2.0',
      updateList: ['Improved messaging'],
      size: 0,
      fileName: '',
      fileType: 1 as const,
      outerLink: 'https://example.invalid/releases/0.2.0',
    }
    vi.mocked(postForm).mockResolvedValue(notice)

    await expect(appUpdateApi.checkForUpdate('0.1.0')).resolves.toEqual(notice)
    expect(postForm).toHaveBeenCalledWith('/app/checkUpdate', { version: '0.1.0' })
  })

  it('returns null when the backend has no newer published release', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await expect(appUpdateApi.checkForUpdate('0.2.0')).resolves.toBeNull()
  })
})
