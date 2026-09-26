import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm } from '@/api/http'
import { contactApi } from '@/api/contacts'

vi.mock('@/api/http', () => ({ postForm: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('contact API', () => {
  it('searches by the exact user contact ID', async () => {
    const result = { contactId: 'U200', contactType: 'USER', nickName: 'Friend', status: null }
    vi.mocked(postForm).mockResolvedValue(result)

    await expect(contactApi.search('U200')).resolves.toEqual(result)
    expect(postForm).toHaveBeenCalledWith('/contact/search', { contactId: 'U200' })
  })

  it('sends an optional greeting with a friend request', async () => {
    vi.mocked(postForm).mockResolvedValue(1)

    await expect(contactApi.applyAdd('U200', '你好')).resolves.toBe(1)
    expect(postForm).toHaveBeenCalledWith('/contact/applyAdd', { contactId: 'U200', applyInfo: '你好' })
  })

  it('allows legacy accounts with no stored join type to return null', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await expect(contactApi.applyAdd('U200')).resolves.toBeNull()
    expect(postForm).toHaveBeenCalledWith('/contact/applyAdd', { contactId: 'U200', applyInfo: '' })
  })
})
