import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm, postMultipart } from '@/api/http'
import { adminApi } from '@/api/admin'

vi.mock('@/api/http', () => ({ postForm: vi.fn(), postMultipart: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('admin API', () => {
  it('loads users with URL-encoded filters and page cursor', async () => {
    const page = { totalCount: 1, pageSize: 20, pageNo: 1, pageTotal: 1, list: [] }
    vi.mocked(postForm).mockResolvedValue(page)

    await expect(adminApi.loadUsers({ pageNo: 1, pageSize: 20, userIdFuzzy: 'U10' })).resolves.toEqual(page)
    expect(postForm).toHaveBeenCalledWith('/admin/loadUser', { pageNo: 1, pageSize: 20, userIdFuzzy: 'U10' })
  })

  it('updates a user status and forces a user offline through the protected admin endpoints', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await adminApi.updateUserStatus('U200', 0)
    expect(postForm).toHaveBeenNthCalledWith(1, '/admin/updateUserStatus', { userId: 'U200', status: 0 })
    await adminApi.forceOffline('U200')
    expect(postForm).toHaveBeenNthCalledWith(2, '/admin/forcedOffOnline', { userId: 'U200' })
  })

  it('loads admin group rows with owner/member summaries and dissolves a selected group', async () => {
    const page = { totalCount: 0, pageSize: 20, pageNo: 1, pageTotal: 0, list: [] }
    vi.mocked(postForm).mockResolvedValue(page)

    await expect(adminApi.loadGroups({ pageNo: 1, pageSize: 20, groupIdFuzzy: 'G30' })).resolves.toEqual(page)
    expect(postForm).toHaveBeenNthCalledWith(1, '/admin/loadGroup', {
      pageNo: 1,
      pageSize: 20,
      groupIdFuzzy: 'G30',
      groupNameFuzzy: undefined,
      groupOwnIdFuzzy: undefined,
      queryGroupOwnerName: true,
      queryMemberCount: true,
    })

    await expect(adminApi.dissolveGroup('U100', 'G300')).resolves.toBe(page)
    expect(postForm).toHaveBeenNthCalledWith(2, '/admin/dissolutionGroup', { groupOwnerId: 'U100', groupId: 'G300' })
  })

  it('loads and saves the complete system settings DTO', async () => {
    const settings = {
      maxGroupCount: 5,
      maxGroupMemberCount: 500,
      maxImageSize: 200,
      maxVideoSize: 500,
      maxFileSize: 5000,
      robotUid: 'Urobot',
      robotNickName: 'WeTalk Robot',
      robotWelcome: 'Welcome',
    }
    vi.mocked(postForm).mockResolvedValue(settings)

    await expect(adminApi.loadSystemSettings()).resolves.toEqual(settings)
    expect(postForm).toHaveBeenNthCalledWith(1, '/admin/getSystemSetting', {})

    await expect(adminApi.saveSystemSettings(settings)).resolves.toBe(settings)
    expect(postForm).toHaveBeenNthCalledWith(2, '/admin/saveSystemSetting', settings)
  })

  it('uses multipart data when saving robot avatar or cover images', async () => {
    const settings = {
      maxGroupCount: 5,
      maxGroupMemberCount: 500,
      maxImageSize: 200,
      maxVideoSize: 500,
      maxFileSize: 5000,
      robotUid: 'Urobot',
      robotNickName: 'WeTalk Robot',
      robotWelcome: 'Welcome',
    }
    const avatar = new File(['avatar'], 'robot.png', { type: 'image/png' })
    const cover = new File(['cover'], 'robot-cover.jpg', { type: 'image/jpeg' })
    vi.mocked(postMultipart).mockResolvedValue(null)

    await adminApi.saveSystemSettings(settings, avatar, cover)

    expect(postForm).not.toHaveBeenCalled()
    expect(postMultipart).toHaveBeenCalledOnce()
    const body = vi.mocked(postMultipart).mock.calls[0]?.[1]
    expect(body).toBeInstanceOf(FormData)
    expect(body?.get('maxGroupMemberCount')).toBe('500')
    expect(body?.get('robotAvatarFile')).toBe(avatar)
    expect(body?.get('robotAvatarCoverFile')).toBe(cover)
  })

  it('filters, saves, and deletes beauty accounts through protected admin endpoints', async () => {
    const page = { totalCount: 1, pageSize: 20, pageNo: 1, pageTotal: 1, list: [] }
    vi.mocked(postForm).mockResolvedValueOnce(page).mockResolvedValue(null)

    await expect(adminApi.loadBeautyAccounts({ pageNo: 1, pageSize: 20, emailFuzzy: 'reserved', status: 0 })).resolves.toEqual(page)
    expect(postForm).toHaveBeenNthCalledWith(1, '/userInfoBeauty/loadBeautyAccountList', {
      pageNo: 1,
      pageSize: 20,
      emailFuzzy: 'reserved',
      userIdFuzzy: undefined,
      status: 0,
    })

    await adminApi.saveBeautyAccount({ id: 8, email: 'reserved@example.invalid', userId: '12345678901', status: 0 })
    expect(postForm).toHaveBeenNthCalledWith(2, '/userInfoBeauty/saveBeautyAccount', {
      id: 8,
      email: 'reserved@example.invalid',
      userId: '12345678901',
      status: 0,
    })

    await adminApi.deleteBeautyAccount(8)
    expect(postForm).toHaveBeenNthCalledWith(3, '/userInfoBeauty/deleteBeautyAccount', { id: 8 })
  })
})
