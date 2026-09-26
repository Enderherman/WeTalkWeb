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
})
