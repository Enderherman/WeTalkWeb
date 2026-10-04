import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appUpdateApi, type AppRelease, type AppReleasePage } from '@/api/appUpdates'
import AdminUpdatesView from '@/views/AdminUpdatesView.vue'

vi.mock('@/api/appUpdates', () => ({ appUpdateApi: {
  loadReleases: vi.fn(), saveRelease: vi.fn(), publishRelease: vi.fn(), deleteRelease: vi.fn(),
} }))
const draft: AppRelease = { id: 9, version: '1.10.0', updateDesc: '修复文件|改进聊天', fileType: 0, status: 0 }
const page: AppReleasePage = { list: [draft], totalCount: 1, pageSize: 20, pageNo: 1, pageTotal: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(appUpdateApi.loadReleases).mockResolvedValue(page)
  vi.mocked(appUpdateApi.saveRelease).mockResolvedValue(null)
  vi.mocked(appUpdateApi.publishRelease).mockResolvedValue(null)
  vi.mocked(appUpdateApi.deleteRelease).mockResolvedValue(null)
})

async function mountPage() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/admin/updates', name: 'admin-updates', component: AdminUpdatesView },
    { path: '/chat', name: 'chat', component: { template: '<div />' } },
  ] })
  await router.push('/admin/updates')
  await router.isReady()
  const wrapper = mount(AdminUpdatesView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('administrator release workflow', () => {
  it('loads and paginates, keeps published releases read-only until withdrawn', async () => {
    vi.mocked(appUpdateApi.loadReleases).mockResolvedValue({ ...page, totalCount: 21, pageTotal: 2, list: [{ ...draft, status: 2 }] })
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('全网发布')
    expect(wrapper.find('[data-testid="edit-release-9"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="delete-release-9"]').exists()).toBe(false)
    await wrapper.get('[data-testid="release-next"]').trigger('click')
    await flushPromises()
    expect(appUpdateApi.loadReleases).toHaveBeenLastCalledWith(2)
  })

  it('validates a new draft and submits safe external links with multiline descriptions', async () => {
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="create-release"]').trigger('click')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('版本号')
    await wrapper.get('[data-testid="release-version"]').setValue('1.11.0')
    await wrapper.get('[data-testid="release-description"]').setValue('新增功能\n修复问题')
    await wrapper.get('[data-testid="release-file-type"]').setValue('1')
    await wrapper.get('[data-testid="release-link"]').setValue('javascript:alert(1)')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    expect(appUpdateApi.saveRelease).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('HTTP')
    await wrapper.get('[data-testid="release-link"]').setValue('https://example.invalid/releases')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(appUpdateApi.saveRelease).toHaveBeenCalledWith({ version: '1.11.0', updateDesc: '新增功能|修复问题', fileType: 1, outerLink: 'https://example.invalid/releases' })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('requires a new installer while preserving one already saved with a draft', async () => {
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="create-release"]').trigger('click')
    await wrapper.get('[data-testid="release-version"]').setValue('1.11.0')
    await wrapper.get('[data-testid="release-description"]').setValue('改进')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('安装包')
    const file = new File(['MZ'], 'WeTalk.exe')
    Object.defineProperty(wrapper.get('[data-testid="release-file"]').element, 'files', { value: [file] })
    await wrapper.get('[data-testid="release-file"]').trigger('change')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(appUpdateApi.saveRelease).toHaveBeenLastCalledWith(expect.objectContaining({ file, fileType: 0 }))
    await wrapper.get('[data-testid="edit-release-9"]').trigger('click')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(appUpdateApi.saveRelease).toHaveBeenLastCalledWith({ id: 9, version: '1.10.0', updateDesc: draft.updateDesc, fileType: 0, outerLink: '' })
  })

  it('confirms gray publication, normalizes user IDs, and can withdraw a release', async () => {
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="publish-release-9"]').trigger('click')
    expect(appUpdateApi.publishRelease).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="release-status"]').setValue('1')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('灰度账号')
    await wrapper.get('[data-testid="release-users"]').setValue('U12345678901，U98765432109\nU12345678901')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(appUpdateApi.publishRelease).toHaveBeenLastCalledWith(9, 1, 'U12345678901,U98765432109')
    await wrapper.get('[data-testid="publish-release-9"]').trigger('click')
    await wrapper.get('[data-testid="release-status"]').setValue('0')
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(appUpdateApi.publishRelease).toHaveBeenLastCalledWith(9, 0, '')
  })

  it('requires delete confirmation and leaves failures open for retry', async () => {
    const wrapper = await mountPage()
    await wrapper.get('[data-testid="delete-release-9"]').trigger('click')
    expect(appUpdateApi.deleteRelease).not.toHaveBeenCalled()
    vi.mocked(appUpdateApi.deleteRelease).mockRejectedValueOnce(new Error('版本已被发布，请刷新列表'))
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('请刷新列表')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.get('[data-testid="release-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('版本草稿已删除')
  })

  it('recovers from list failure and returns keyboard focus after closing the dialog', async () => {
    vi.mocked(appUpdateApi.loadReleases).mockRejectedValueOnce(new Error('暂不可用'))
    const wrapper = await mountPage()
    expect(wrapper.get('[role="alert"]').text()).toContain('暂不可用')
    await wrapper.get('[data-testid="refresh-releases"]').trigger('click')
    await flushPromises()
    document.body.appendChild(wrapper.element)
    const opener = wrapper.get('[data-testid="create-release"]')
    await opener.trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('[data-testid="release-version"]').element)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.activeElement).toBe(opener.element)
    wrapper.unmount()
    wrapper.element.remove()
  })
})
