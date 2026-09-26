import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApi, type SystemSettings } from '@/api/admin'
import { chatApi } from '@/api/chat'
import AdminSettingsView from '@/views/AdminSettingsView.vue'

const { settingsStore } = vi.hoisted(() => ({ settingsStore: { setSettings: vi.fn() } }))

vi.mock('@/api/admin', () => ({
  adminApi: {
    loadSystemSettings: vi.fn(),
    saveSystemSettings: vi.fn(),
  },
}))

vi.mock('@/stores/systemSettings', () => ({ useSystemSettingsStore: () => settingsStore }))
vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

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
  vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('Robot avatar is not configured in this test.'))
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

    expect(adminApi.saveSystemSettings).toHaveBeenCalledWith({ ...settings, robotNickName: 'WeTalk Helper' }, null, null)
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

  it('uploads a validated robot avatar and cover with the system settings', async () => {
    const wrapper = await mountAdminSettings()
    const avatar = new File(['avatar'], 'robot.png', { type: 'image/png' })
    const cover = new File(['cover'], 'robot-cover.jpg', { type: 'image/jpeg' })
    const avatarInput = wrapper.get('[data-testid="robot-avatar-file"]')
    const coverInput = wrapper.get('[data-testid="robot-avatar-cover-file"]')
    Object.defineProperty(avatarInput.element, 'files', { configurable: true, value: [avatar] })
    Object.defineProperty(coverInput.element, 'files', { configurable: true, value: [cover] })
    await avatarInput.trigger('change')
    await coverInput.trigger('change')
    await wrapper.get('[data-testid="admin-settings-form"]').trigger('submit')
    await flushPromises()

    expect(adminApi.saveSystemSettings).toHaveBeenCalledWith(settings, avatar, cover)
    expect(settingsStore.setSettings).toHaveBeenCalledOnce()
    expect(wrapper.get('[role="status"]').text()).toContain('系统设置已保存')
  })

  it('rejects unsupported robot images before saving', async () => {
    const wrapper = await mountAdminSettings()
    const avatarInput = wrapper.get('[data-testid="robot-avatar-file"]')
    Object.defineProperty(avatarInput.element, 'files', {
      configurable: true,
      value: [new File(['binary'], 'robot.exe', { type: 'application/octet-stream' })],
    })
    await avatarInput.trigger('change')
    await wrapper.get('[data-testid="admin-settings-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('头像和封面需使用 PNG、JPEG、GIF、BMP 或 WebP 图片')
    expect(adminApi.saveSystemSettings).not.toHaveBeenCalled()
  })
})
