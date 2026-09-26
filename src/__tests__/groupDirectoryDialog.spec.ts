import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type GroupProfile, type UserContactEntry } from '@/api/contacts'
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

const group: UserContactEntry = {
  userId: 'U100',
  contactId: 'G300',
  contactType: 1,
  status: 1,
  contactName: 'Student Group',
  memberCount: 5,
}

const profile: GroupProfile = {
  groupId: 'G300',
  groupName: 'Student Group',
  groupOwnId: 'U100',
  createTime: '2026-09-25 12:00:00',
  groupNotice: '课程讨论群',
  joinType: 1,
  status: 1,
  memberCount: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contactApi.loadContacts).mockResolvedValue([group])
  vi.mocked(contactApi.loadOwnedGroups).mockResolvedValue([])
  vi.mocked(contactApi.getGroupInfo).mockResolvedValue(profile)
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

    expect(contactApi.getGroupInfo).toHaveBeenCalledWith('G300')
    expect(wrapper.get('.contact-profile-panel').text()).toContain('课程讨论群')
    expect(wrapper.get('.contact-profile-panel').text()).toContain('5 人')
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
})
