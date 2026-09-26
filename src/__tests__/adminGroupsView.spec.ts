import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type AdminGroupPage } from '@/api/admin'
import { chatApi } from '@/api/chat'
import AdminGroupsView from '@/views/AdminGroupsView.vue'

vi.mock('@/api/admin', () => ({
  adminApi: {
    loadGroups: vi.fn(),
    dissolveGroup: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

const page: AdminGroupPage = {
  totalCount: 1,
  pageSize: 20,
  pageNo: 1,
  pageTotal: 1,
  list: [{
    groupId: 'G300',
    groupName: 'Study Group',
    groupOwnId: 'U200',
    groupOwnerNickName: 'Owner',
    memberCount: 4,
    status: 1,
    joinType: 0,
    createTime: '2026-09-27 00:00:00',
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.loadGroups).mockResolvedValue(page)
  vi.mocked(adminApi.dissolveGroup).mockResolvedValue(null)
  vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('Avatar unavailable in unit tests'))
})

async function mountAdminGroups() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/groups', name: 'admin-groups', component: AdminGroupsView },
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>users</div>' } },
      { path: '/chat', name: 'chat', component: { template: '<div>chat</div>' } },
    ],
  })
  await router.push('/admin/groups')
  await router.isReady()
  const wrapper = mount(AdminGroupsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('admin groups view', () => {
  it('loads group owner/member summaries, filters, and confirms dissolution', async () => {
    const wrapper = await mountAdminGroups()
    expect(wrapper.get('[data-testid="admin-group-G300"]').text()).toContain('Owner')
    expect(wrapper.get('[data-testid="admin-group-G300"]').text()).toContain('4 位成员')

    await wrapper.get('[data-testid="admin-group-name-filter"]').setValue('Study')
    await wrapper.get('[data-testid="admin-group-search"]').trigger('submit')
    await flushPromises()
    expect(adminApi.loadGroups).toHaveBeenLastCalledWith({
      pageNo: 1,
      pageSize: 20,
      groupIdFuzzy: '',
      groupNameFuzzy: 'Study',
      groupOwnIdFuzzy: '',
    })

    await wrapper.get('[data-testid="dissolve-admin-group-G300"]').trigger('click')
    expect(adminApi.dissolveGroup).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-dissolve-group"]').trigger('click')
    await flushPromises()
    expect(adminApi.dissolveGroup).toHaveBeenCalledWith('U200', 'G300')
  })
})
