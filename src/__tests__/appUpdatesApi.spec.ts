import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm, postMultipart } from '@/api/http'
import { appUpdateApi } from '@/api/appUpdates'

vi.mock('@/api/http', () => ({ postForm: vi.fn(), postMultipart: vi.fn() }))

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

  it('uploads the selected installer and fields as multipart without the short JSON timeout', async () => {
    const file = new File(['installer'], 'WeTalk.exe')
    await appUpdateApi.saveRelease({ version: '1.10.0', updateDesc: '修复|改进', fileType: 0, outerLink: '', file })
    const [path, body, options] = vi.mocked(postMultipart).mock.calls[0]!
    expect(path).toBe('/app/saveUpdate')
    expect(body.get('file')).toBe(file)
    expect(body.get('version')).toBe('1.10.0')
    expect(body.get('fileType')).toBe('0')
    expect(body.has('id')).toBe(false)
    expect(options).toEqual({ timeoutMs: 0 })
  })

  it('preserves an existing installer on edit and clears graylist for global publication', async () => {
    await appUpdateApi.saveRelease({ id: 9, version: '1.10.0', updateDesc: '修复', fileType: 0, outerLink: '' })
    const body = vi.mocked(postMultipart).mock.calls[0]![1]
    expect(body.get('id')).toBe('9')
    expect(body.has('file')).toBe(false)
    await appUpdateApi.publishRelease(9, 2, 'U12345678901')
    expect(postForm).toHaveBeenLastCalledWith('/app/postUpdate', { id: 9, status: 2, grayscaleUid: '' })
    await appUpdateApi.publishRelease(9, 1, 'U12345678901')
    expect(postForm).toHaveBeenLastCalledWith('/app/postUpdate', { id: 9, status: 1, grayscaleUid: 'U12345678901' })
    await appUpdateApi.deleteRelease(9)
    expect(postForm).toHaveBeenLastCalledWith('/app/deleteUpdate', { id: 9 })
  })
})
