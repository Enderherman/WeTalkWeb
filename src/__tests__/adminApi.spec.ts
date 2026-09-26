import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm } from '@/api/http'
import { adminApi } from '@/api/admin'

vi.mock('@/api/http', () => ({ postForm: vi.fn() }))

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
})
