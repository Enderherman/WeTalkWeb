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

vi.mock('@/api/groups', () => ({ groupApi: { create: vi.fn(), getInfoForChat: vi.fn() } }))

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
  vi.mocked(groupApi.getInfoForChat).mockResolvedValue(groupDetails)
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
    expect(wrapper.emitted('groupCreated')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toContain('群聊创建成功')
  })
})
