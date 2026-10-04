import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type GroupProfile, type UserContactEntry } from '@/api/contacts'
import { groupApi, type GroupInfoWithMembers } from '@/api/groups'
import GroupDirectoryDialog from '@/components/GroupDirectoryDialog.vue'
import { chatApi } from '@/api/chat'

const { settingsStore } = vi.hoisted(() => ({
  settingsStore: {
    settings: { maxGroupCount: 5, maxGroupMemberCount: 500, maxImageSize: 200, maxVideoSize: 500, maxFileSize: 5000 },
    loaded: true,
    loading: false,
    load: vi.fn(),
  },
}))

vi.mock('@/api/contacts', () => ({
  contactApi: {
    search: vi.fn(),
    applyAdd: vi.fn(),
    loadApplications: vi.fn(),
    handleApplication: vi.fn(),
    loadContacts: vi.fn(),
    loadOwnedGroups: vi.fn(),
    getContactUserInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    deleteContact: vi.fn(),
    blockContact: vi.fn(),
  },
}))

vi.mock('@/api/groups', () => ({
  groupApi: {
    create: vi.fn(),
    update: vi.fn(),
    getInfoForChat: vi.fn(),
    manageMembers: vi.fn(),
    leaveGroup: vi.fn(),
    dissolveGroup: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

vi.mock('@/stores/systemSettings', () => ({ useSystemSettingsStore: () => settingsStore }))

const group: UserContactEntry = {
  userId: 'U100',
  contactId: 'G300',
  contactType: 1,
  status: 1,
  contactName: 'Student Group',
  memberCount: null,
}

const profile: GroupProfile = {
  groupId: 'G300',
  groupName: 'Student Group',
  groupOwnId: 'U100',
  createTime: '2026-09-25 12:00:00',
  groupNotice: '课程讨论群',
  joinType: 1,
  status: 1,
  memberCount: null,
}

const groupDetails: GroupInfoWithMembers = {
  groupInfo: profile,
  userContactList: [
    { userId: 'U100', contactId: 'G300', contactName: 'Owner' },
    { userId: 'U200', contactId: 'G300', contactName: 'Member' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(settingsStore.settings, {
    maxGroupCount: 5,
    maxGroupMemberCount: 500,
    maxImageSize: 200,
    maxVideoSize: 500,
    maxFileSize: 5000,
  })
  settingsStore.loaded = true
  settingsStore.loading = false
  settingsStore.load.mockResolvedValue(settingsStore.settings)
  vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('Avatar unavailable in unit tests'))
  vi.mocked(contactApi.loadContacts).mockResolvedValue([group])
  vi.mocked(contactApi.loadOwnedGroups).mockResolvedValue([])
  vi.mocked(groupApi.create).mockResolvedValue(null)
  vi.mocked(groupApi.update).mockResolvedValue(null)
  vi.mocked(groupApi.getInfoForChat).mockResolvedValue(groupDetails)
  vi.mocked(groupApi.manageMembers).mockResolvedValue('已处理')
  vi.mocked(groupApi.leaveGroup).mockResolvedValue('已退出')
  vi.mocked(groupApi.dissolveGroup).mockResolvedValue(null)
})

describe('group directory dialog', () => {
  it('previews and uploads an optional cover when creating a group and releases previews afterward', async () => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: (file: File) => `blob:${file.name}`, revokeObjectURL: revoke }))
    const wrapper = mount(GroupDirectoryDialog)
    try {
      await flushPromises()
      await wrapper.get('[data-testid="open-group-create"]').trigger('click')
      await wrapper.get('[data-testid="new-group-name"]').setValue('With cover')
      const avatarFile = new File(['png'], 'avatar.png', { type: 'image/png' })
      const coverFile = new File(['jpeg'], 'cover.jpg', { type: 'image/jpeg' })
      for (const [selector, file] of [['new-group-avatar', avatarFile], ['new-group-cover', coverFile]] as const) {
        const input = wrapper.get(`[data-testid="${selector}"]`)
        Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
        await input.trigger('change')
      }
      expect(wrapper.get('[alt="已选群封面预览"]').attributes('src')).toBe('blob:cover.jpg')
      await wrapper.get('[data-testid="group-create-form"]').trigger('submit')
      await flushPromises()
      expect(groupApi.create).toHaveBeenCalledWith(expect.objectContaining({ avatarFile, coverFile }))
      expect(revoke).toHaveBeenCalledWith('blob:cover.jpg')
      expect(revoke).toHaveBeenCalledWith('blob:avatar.png')
    } finally { wrapper.unmount(); vi.unstubAllGlobals() }
  })

  it('lets the owner replace only the cover and preserves selection on a failed save', async () => {
    vi.mocked(groupApi.update).mockRejectedValueOnce(new Error('Try again')).mockResolvedValueOnce(null)
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="open-edit-group"]').trigger('click')
    const coverFile = new File(['webp'], 'cover.webp', { type: 'image/webp' })
    const input = wrapper.get('[data-testid="edit-group-cover"]')
    Object.defineProperty(input.element, 'files', { value: [coverFile] })
    await input.trigger('change')
    await wrapper.get('[data-testid="edit-group-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Try again')
    await wrapper.get('[data-testid="edit-group-form"]').trigger('submit')
    await flushPromises()
    expect(groupApi.update).toHaveBeenLastCalledWith(expect.objectContaining({ avatarFile: null, coverFile }))
    expect(wrapper.find('[data-testid="edit-group-form"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['jpeg'], 'wrong.png', { type: 'image/jpeg' }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
  ])('rejects invalid optional covers without making a group update', async (file) => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="open-edit-group"]').trigger('click')
    const input = wrapper.get('[data-testid="edit-group-cover"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await wrapper.get('[data-testid="edit-group-form"]').trigger('submit')
    await flushPromises()
    expect(groupApi.update).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it("loads the current user's groups and reads selected group details", async () => {
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()
    expect(contactApi.loadContacts).toHaveBeenCalledWith('GROUP')
    expect(contactApi.loadOwnedGroups).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="group-G300"]').text()).toContain('Student Group')

    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()

    expect(groupApi.getInfoForChat).toHaveBeenCalledWith('G300')
    expect(wrapper.get('.contact-profile-panel').text()).toContain('课程讨论群')
    expect(wrapper.get('.contact-profile-panel').text()).toContain('2 人')
    expect(wrapper.text()).toContain('Member')
    expect(wrapper.text()).toContain('群主')
  })

  it('shows an empty state when the account has no groups', async () => {
    vi.mocked(contactApi.loadContacts).mockResolvedValue([])
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()

    expect(wrapper.get('[data-testid="groups-empty"]').text()).toContain('还没有加入群聊')
  })

  it('includes groups owned by the current user', async () => {
    vi.mocked(contactApi.loadContacts).mockResolvedValue([])
    vi.mocked(contactApi.loadOwnedGroups).mockResolvedValue([profile])
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()

    expect(wrapper.get('[data-testid="group-G300"]').text()).toContain('Student Group')
  })

  it('blocks group creation after the configured per-account quota is reached', async () => {
    vi.mocked(contactApi.loadOwnedGroups).mockResolvedValue([profile])
    settingsStore.settings.maxGroupCount = 1
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()

    expect(wrapper.get('[data-testid="group-create-limit"]').text()).toContain('1 / 1')
    expect((wrapper.get('[data-testid="open-group-create"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(groupApi.create).not.toHaveBeenCalled()
  })

  it('requires an avatar before creating a group', async () => {
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="open-group-create"]').trigger('click')
    await wrapper.get('[data-testid="new-group-name"]').setValue('Study Group')
    await wrapper.get('[data-testid="group-create-form"]').trigger('submit')

    expect(groupApi.create).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('请选择群头像')
  })

  it.each([['jpg', 'image/jpeg'], ['webp', 'image/webp']])('creates groups with a supported %s avatar', async (extension, type) => {
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="open-group-create"]').trigger('click')
    await wrapper.get('[data-testid="new-group-name"]').setValue('Supported image')
    const avatar = new File(['image bytes'], `avatar.${extension}`, { type })
    const input = wrapper.get('[data-testid="new-group-avatar"]')
    Object.defineProperty(input.element, 'files', { value: [avatar] })
    await input.trigger('change')
    await wrapper.get('[data-testid="group-create-form"]').trigger('submit')
    await flushPromises()
    expect(groupApi.create).toHaveBeenCalledWith(expect.objectContaining({ avatarFile: avatar }))
    wrapper.unmount()
  })

  it.each([true, false])('rejects empty avatar files on create=%s before requesting the backend', async (creating) => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    if (creating) {
      await wrapper.get('[data-testid="open-group-create"]').trigger('click')
      await wrapper.get('[data-testid="new-group-name"]').setValue('Empty image')
    } else {
      await wrapper.get('[data-testid="group-G300"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="open-edit-group"]').trigger('click')
    }
    const input = wrapper.get(creating ? '[data-testid="new-group-avatar"]' : '[data-testid="edit-group-avatar"]')
    Object.defineProperty(input.element, 'files', { value: [new File([], 'empty.png', { type: 'image/png' })] })
    await input.trigger('change')
    await wrapper.get(creating ? '[data-testid="group-create-form"]' : '[data-testid="edit-group-form"]').trigger('submit')
    await flushPromises()
    expect(groupApi.create).not.toHaveBeenCalled()
    expect(groupApi.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('不能为空')
    wrapper.unmount()
  })

  it('creates a group and refreshes the combined directory', async () => {
    const avatar = new File(['png bytes'], 'avatar.png', { type: 'image/png' })
    vi.mocked(contactApi.loadOwnedGroups).mockResolvedValueOnce([]).mockResolvedValueOnce([profile])
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="open-group-create"]').trigger('click')
    await wrapper.get('[data-testid="new-group-name"]').setValue('Student Group')
    await wrapper.get('[data-testid="new-group-notice"]').setValue('课程通知')
    await wrapper.get('[data-testid="new-group-join-type"]').setValue('0')
    const avatarInput = wrapper.get('[data-testid="new-group-avatar"]')
    Object.defineProperty(avatarInput.element, 'files', { value: [avatar] })
    await avatarInput.trigger('change')
    await wrapper.get('[data-testid="group-create-form"]').trigger('submit')
    await flushPromises()

    expect(groupApi.create).toHaveBeenCalledWith({
      groupName: 'Student Group',
      groupNotice: '课程通知',
      joinType: 0,
      avatarFile: avatar,
    })
    expect(contactApi.loadOwnedGroups).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="group-G300"]').exists()).toBe(true)
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toContain('群聊创建成功')
  })

  it('lets the owner update group name, notice, and join policy without replacing the avatar', async () => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="open-edit-group"]').trigger('click')
    await wrapper.get('[data-testid="edit-group-name"]').setValue('Renamed Group')
    await wrapper.get('[data-testid="edit-group-notice"]').setValue('Updated notice')
    await wrapper.get('[data-testid="edit-group-join-type"]').setValue('0')
    await wrapper.get('[data-testid="edit-group-form"]').trigger('submit')
    await flushPromises()

    expect(groupApi.update).toHaveBeenCalledWith({
      groupId: 'G300',
      groupName: 'Renamed Group',
      groupNotice: 'Updated notice',
      joinType: 0,
      avatarFile: null,
    })
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
  })

  it('lets the owner select a friend to add to the group', async () => {
    const friend: UserContactEntry = { userId: 'U100', contactId: 'U300', contactType: 0, status: 1, contactName: 'New Friend' }
    vi.mocked(contactApi.loadContacts).mockImplementation(async (kind) => (kind === 'USER' ? [friend] : [group]))
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="open-add-group-members"]').trigger('click')
    await flushPromises()
    await wrapper.get('.group-friend-option input').setValue(true)
    await wrapper.get('[data-testid="confirm-add-group-members"]').trigger('click')
    await flushPromises()

    expect(contactApi.loadContacts).toHaveBeenCalledWith('USER')
    expect(groupApi.manageMembers).toHaveBeenCalledWith('G300', ['U300'], 1)
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
  })

  it('prevents selecting members beyond the configured group limit', async () => {
    const friend: UserContactEntry = { userId: 'U100', contactId: 'U300', contactType: 0, status: 1, contactName: 'New Friend' }
    vi.mocked(contactApi.loadContacts).mockImplementation(async (kind) => (kind === 'USER' ? [friend] : [group]))
    settingsStore.settings.maxGroupMemberCount = 2
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="open-add-group-members"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="group-member-picker"]').text()).toContain('当前 2 / 2 人，还可添加 0 人')
    expect((wrapper.get('.group-friend-option input').element as HTMLInputElement).disabled).toBe(true)
    expect(groupApi.manageMembers).not.toHaveBeenCalled()
  })

  it('requires confirmation before the owner removes a group member', async () => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="remove-group-member-U200"]').trigger('click')

    expect(groupApi.manageMembers).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-group-action"]').trigger('click')
    await flushPromises()

    expect(groupApi.manageMembers).toHaveBeenCalledWith('G300', ['U200'], 0)
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
  })

  it('lets a non-owner leave a group after confirmation', async () => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U200' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="request-leave-group"]').trigger('click')
    await wrapper.get('[data-testid="confirm-group-action"]').trigger('click')
    await flushPromises()

    expect(groupApi.leaveGroup).toHaveBeenCalledWith('G300')
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
    expect(wrapper.find('[data-testid="request-dissolve-group"]').exists()).toBe(false)
  })

  it('lets the group owner dissolve a group after confirmation', async () => {
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    await flushPromises()
    await wrapper.get('[data-testid="group-G300"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="request-dissolve-group"]').trigger('click')
    await wrapper.get('[data-testid="confirm-group-action"]').trigger('click')
    await flushPromises()

    expect(groupApi.dissolveGroup).toHaveBeenCalledWith('G300')
    expect(wrapper.emitted('groupChanged')).toHaveLength(1)
  })

  it('keeps keyboard focus inside the group dialog and restores its opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(GroupDirectoryDialog, { props: { currentUserId: 'U100' } })
    document.body.appendChild(wrapper.element)
    await flushPromises()

    const dialog = wrapper.get('.group-directory-dialog')
    const closeButton = wrapper.get('[aria-label="关闭群聊列表"]')
    expect(document.activeElement).toBe(closeButton.element)
    const focusable = Array.from(dialog.element.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    first.focus()
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    last.focus()
    await dialog.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    await closeButton.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
    wrapper.element.remove()
    opener.remove()
  })
})
