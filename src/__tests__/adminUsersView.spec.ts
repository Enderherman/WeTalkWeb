import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type AdminUserPage } from '@/api/admin'
import { chatApi } from '@/api/chat'
import { useAuthStore } from '@/stores/auth'
import AdminUsersView from '@/views/AdminUsersView.vue'

vi.mock('@/api/admin', () => ({
  adminApi: {
    loadUsers: vi.fn(),
    updateUserStatus: vi.fn(),
    forceOffline: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

const usersPage: AdminUserPage = {
  totalCount: 2,
  pageSize: 20,
  pageNo: 1,
  pageTotal: 1,
  list: [
    { userId: 'U200', email: 'user@example.invalid', nickName: 'User', status: 1, onlineType: 1 },
    { userId: 'U201', email: 'other@example.invalid', nickName: 'Other', status: 0, onlineType: 0 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.loadUsers).mockResolvedValue(usersPage)
  vi.mocked(adminApi.updateUserStatus).mockResolvedValue(null)
  vi.mocked(adminApi.forceOffline).mockResolvedValue(null)
  vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('Avatar unavailable in unit tests'))
})

async function mountAdminUsers() {
  const pinia = createPinia()
  const authStore = useAuthStore(pinia)
  authStore.setSession({ token: '', userId: 'UADMIN', email: 'admin@example.invalid', nickName: 'Admin', admin: true })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/users', name: 'admin-users', component: AdminUsersView },
      { path: '/chat', name: 'chat', component: { template: '<div>chat</div>' } },
    ],
  })
  await router.push('/admin/users')
  await router.isReady()
  const wrapper = mount(AdminUsersView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

describe('admin users view', () => {
  it('loads password-free user rows and submits search filters', async () => {
    const wrapper = await mountAdminUsers()
    expect(wrapper.get('[data-testid="admin-user-list"]').text()).toContain('user@example.invalid')
    expect(wrapper.get('[data-testid="admin-user-U200"]').text()).toContain('在线')
    expect(wrapper.text()).not.toContain('password')

    await wrapper.get('[data-testid="admin-user-id-filter"]').setValue('U20')
    await wrapper.get('[data-testid="admin-user-search"]').trigger('submit')
    await flushPromises()
    expect(adminApi.loadUsers).toHaveBeenLastCalledWith({
      pageNo: 1,
      pageSize: 20,
      userIdFuzzy: 'U20',
      emailFuzzy: '',
      nickNameFuzzy: '',
    })
  })

  it('requires confirmation for account state changes and forced logout', async () => {
    const wrapper = await mountAdminUsers()
    await wrapper.get('[data-testid="toggle-status-U200"]').trigger('click')
    await wrapper.get('[data-testid="confirm-admin-action"]').trigger('click')
    await flushPromises()
    expect(adminApi.updateUserStatus).toHaveBeenCalledWith('U200', 0)
    expect(wrapper.text()).toContain('已禁用 U200')

    await wrapper.get('[data-testid="force-offline-U200"]').trigger('click')
    await wrapper.get('[data-testid="confirm-admin-action"]').trigger('click')
    await flushPromises()
    expect(adminApi.forceOffline).toHaveBeenCalledWith('U200')
    expect(wrapper.text()).toContain('已强制下线 U200')
  })

  it('does not offer self-disable or self-force-offline controls', async () => {
    vi.mocked(adminApi.loadUsers).mockResolvedValue({
      ...usersPage,
      list: [{ userId: 'UADMIN', email: 'admin@example.invalid', nickName: 'Admin', status: 1, onlineType: 1 }],
    })
    const wrapper = await mountAdminUsers()

    expect(wrapper.get('[data-testid="toggle-status-UADMIN"]').element).toHaveProperty('disabled', true)
    expect(wrapper.get('[data-testid="force-offline-UADMIN"]').element).toHaveProperty('disabled', true)
  })
})
