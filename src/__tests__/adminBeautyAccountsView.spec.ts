import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type BeautyAccountPage } from '@/api/admin'
import AdminBeautyAccountsView from '@/views/AdminBeautyAccountsView.vue'

vi.mock('@/api/admin', () => ({
  adminApi: {
    loadBeautyAccounts: vi.fn(),
    saveBeautyAccount: vi.fn(),
    deleteBeautyAccount: vi.fn(),
  },
}))

const page: BeautyAccountPage = {
  totalCount: 1,
  pageSize: 20,
  pageNo: 1,
  pageTotal: 1,
  list: [{ id: 8, email: 'reserved@example.invalid', userId: '12345678901', status: 0 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.loadBeautyAccounts).mockResolvedValue(page)
  vi.mocked(adminApi.saveBeautyAccount).mockResolvedValue(null)
  vi.mocked(adminApi.deleteBeautyAccount).mockResolvedValue(null)
})

async function mountBeautyAccounts() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/beauty-accounts', name: 'admin-beauty-accounts', component: AdminBeautyAccountsView },
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>users</div>' } },
      { path: '/admin/groups', name: 'admin-groups', component: { template: '<div>groups</div>' } },
      { path: '/admin/settings', name: 'admin-settings', component: { template: '<div>settings</div>' } },
      { path: '/chat', name: 'chat', component: { template: '<div>chat</div>' } },
    ],
  })
  await router.push('/admin/beauty-accounts')
  await router.isReady()
  const wrapper = mount(AdminBeautyAccountsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('admin beauty accounts view', () => {
  it('loads accounts, searches by email, and marks used accounts as read-only', async () => {
    vi.mocked(adminApi.loadBeautyAccounts).mockResolvedValue({
      ...page,
      list: [{ ...page.list[0]!, status: 1 }],
    })
    const wrapper = await mountBeautyAccounts()
    expect(wrapper.get('[data-testid="beauty-account-8"]').text()).toContain('已使用')
    expect(wrapper.find('[data-testid="edit-beauty-8"]').exists()).toBe(false)

    await wrapper.get('[data-testid="beauty-email-filter"]').setValue('reserved')
    await wrapper.get('[data-testid="beauty-search"]').trigger('submit')
    await flushPromises()
    expect(adminApi.loadBeautyAccounts).toHaveBeenLastCalledWith({
      pageNo: 1,
      pageSize: 20,
      emailFuzzy: 'reserved',
      userIdFuzzy: '',
    })
  })

  it('validates a new 11-digit beauty number and saves it', async () => {
    const wrapper = await mountBeautyAccounts()
    await wrapper.get('[data-testid="add-beauty-account"]').trigger('click')
    await wrapper.get('[data-testid="beauty-edit-form"]').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('有效邮箱')
    expect(adminApi.saveBeautyAccount).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="beauty-edit-email"]').setValue('new@example.invalid')
    await wrapper.get('[data-testid="beauty-edit-user-id"]').setValue('123')
    await wrapper.get('[data-testid="beauty-edit-form"]').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('11 位数字')
    expect(adminApi.saveBeautyAccount).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="beauty-edit-user-id"]').setValue('98765432101')
    await wrapper.get('[data-testid="beauty-edit-form"]').trigger('submit')
    await flushPromises()
    expect(adminApi.saveBeautyAccount).toHaveBeenCalledWith({
      email: 'new@example.invalid',
      userId: '98765432101',
      status: 0,
    })
    expect(wrapper.text()).toContain('靓号已添加')
  })

  it('requires confirmation before deleting an account and can edit unused records', async () => {
    const wrapper = await mountBeautyAccounts()
    await wrapper.get('[data-testid="edit-beauty-8"]').trigger('click')
    await wrapper.get('[data-testid="beauty-edit-email"]').setValue('changed@example.invalid')
    await wrapper.get('[data-testid="beauty-edit-form"]').trigger('submit')
    await flushPromises()
    expect(adminApi.saveBeautyAccount).toHaveBeenCalledWith({
      id: 8,
      email: 'changed@example.invalid',
      userId: '12345678901',
      status: 0,
    })

    await wrapper.get('[data-testid="delete-beauty-8"]').trigger('click')
    expect(adminApi.deleteBeautyAccount).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-delete-beauty-8"]').trigger('click')
    await flushPromises()
    expect(adminApi.deleteBeautyAccount).toHaveBeenCalledWith(8)
    expect(wrapper.text()).toContain('已删除')
  })
})
