import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type GroupProfile, type UserContactEntry } from '@/api/contacts'
import { groupApi, type GroupInfoWithMembers } from '@/api/groups'
import GroupDirectoryDialog from '@/components/GroupDirectoryDialog.vue'

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

  it('requires a PNG avatar before creating a group', async () => {
    const wrapper = mount(GroupDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="open-group-create"]').trigger('click')
    await wrapper.get('[data-testid="new-group-name"]').setValue('Study Group')
    await wrapper.get('[data-testid="group-create-form"]').trigger('submit')

    expect(groupApi.create).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('请选择 PNG 群头像')
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
})
