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

  it('loads a page of received contact applications', async () => {
    const page = { totalCount: 1, pageSize: 15, pageNo: 2, pageTotal: 2, list: [] }
    vi.mocked(postForm).mockResolvedValue(page)

    await expect(contactApi.loadApplications(2)).resolves.toEqual(page)
    expect(postForm).toHaveBeenCalledWith('/contact/loadApply', { pageNo: 2 })
  })

  it('handles a received application with the chosen decision code', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await expect(contactApi.handleApplication(91, 3)).resolves.toBeNull()
    expect(postForm).toHaveBeenCalledWith('/contact/dealWithApply', { applyId: 91, status: 3 })
  })

  it("loads the current user's friend directory", async () => {
    const contacts = [{ userId: 'U100', contactId: 'U200', contactType: 0, status: 1, contactName: 'Friend' }]
    vi.mocked(postForm).mockResolvedValue(contacts)

    await expect(contactApi.loadContacts('USER')).resolves.toEqual(contacts)
    expect(postForm).toHaveBeenCalledWith('/contact/loadContact', { contactType: 'USER' })
  })

  it('loads friend details and sends delete or block decisions', async () => {
    const profile = { userId: 'U200', nickName: 'Friend', sex: 1, areaName: 'Shanghai', contactStatus: 1 }
    vi.mocked(postForm).mockResolvedValueOnce(profile).mockResolvedValue(null)

    await expect(contactApi.getContactUserInfo('U200')).resolves.toEqual(profile)
    await expect(contactApi.deleteContact('U200')).resolves.toBeNull()
    await expect(contactApi.blockContact('U200')).resolves.toBeNull()
    expect(postForm).toHaveBeenNthCalledWith(1, '/contact/getContactUserInfo', { contactId: 'U200' })
    expect(postForm).toHaveBeenNthCalledWith(2, '/contact/delContact', { contactId: 'U200' })
    expect(postForm).toHaveBeenNthCalledWith(3, '/contact/addContact2BlackList', { contactId: 'U200' })
  })

  it('loads group details by group ID', async () => {
    const group = { groupId: 'G300', groupName: 'Student Group', groupOwnId: 'U100', joinType: 1, status: 1, memberCount: 5 }
    vi.mocked(postForm).mockResolvedValue(group)

    await expect(contactApi.getGroupInfo('G300')).resolves.toEqual(group)
    expect(postForm).toHaveBeenCalledWith('/group/getGroupInfo', { groupId: 'G300' })
  })

  it('loads groups owned by the current user', async () => {
    const groups = [{ groupId: 'G300', groupName: 'Student Group', groupOwnId: 'U100', joinType: 1, status: 1, memberCount: 5 }]
    vi.mocked(postForm).mockResolvedValue(groups)

    await expect(contactApi.loadOwnedGroups()).resolves.toEqual(groups)
    expect(postForm).toHaveBeenCalledWith('/group/loadMyGroup', {})
  })
})
