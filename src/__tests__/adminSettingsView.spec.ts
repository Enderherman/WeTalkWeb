import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type SystemSettings } from '@/api/admin'
import AdminSettingsView from '@/views/AdminSettingsView.vue'

vi.mock('@/api/admin', () => ({
  adminApi: {
    loadSystemSettings: vi.fn(),
    saveSystemSettings: vi.fn(),
  },
}))

const settings: SystemSettings = {
  maxGroupCount: 5,
  maxGroupMemberCount: 500,
  maxImageSize: 200,
  maxVideoSize: 500,
  maxFileSize: 5000,
  robotUid: 'Urobot',
  robotNickName: 'WeTalk Robot',
  robotWelcome: 'Welcome to WeTalk',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(adminApi.loadSystemSettings).mockResolvedValue({ ...settings })
  vi.mocked(adminApi.saveSystemSettings).mockResolvedValue(null)
})

async function mountAdminSettings() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/settings', name: 'admin-settings', component: AdminSettingsView },
      { path: '/admin/users', name: 'admin-users', component: { template: '<div>users</div>' } },
      { path: '/admin/groups', name: 'admin-groups', component: { template: '<div>groups</div>' } },
      { path: '/chat', name: 'chat', component: { template: '<div>chat</div>' } },
    ],
  })
  await router.push('/admin/settings')
  await router.isReady()
  const wrapper = mount(AdminSettingsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('admin system settings view', () => {
  it('loads settings and saves the complete DTO after validation', async () => {
    const wrapper = await mountAdminSettings()
    expect((wrapper.get('[data-testid="setting-robot-id"]').element as HTMLInputElement).value).toBe('Urobot')
    expect((wrapper.get('[data-testid="setting-max-group-count"]').element as HTMLInputElement).value).toBe('5')

    await wrapper.get('[data-testid="setting-robot-name"]').setValue('WeTalk Helper')
    await wrapper.get('[data-testid="admin-settings-form"]').trigger('submit')
    await flushPromises()

    expect(adminApi.saveSystemSettings).toHaveBeenCalledWith({ ...settings, robotNickName: 'WeTalk Helper' })
    expect(wrapper.get('[role="status"]').text()).toContain('系统设置已保存')
  })

  it('rejects zero or fractional settings without sending a request', async () => {
    const wrapper = await mountAdminSettings()
    await wrapper.get('[data-testid="setting-max-image-size"]').setValue('0')
    await wrapper.get('[data-testid="admin-settings-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('图片大小上限必须是大于 0 的整数')
    expect(adminApi.saveSystemSettings).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="setting-max-image-size"]').setValue('1.5')
    await wrapper.get('[data-testid="admin-settings-form"]').trigger('submit')
    await flushPromises()
    expect(adminApi.saveSystemSettings).not.toHaveBeenCalled()
  })
})
