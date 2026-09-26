import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type ContactProfile, type UserContactEntry } from '@/api/contacts'
import ContactDirectoryDialog from '@/components/ContactDirectoryDialog.vue'

vi.mock('@/api/contacts', () => ({
  contactApi: {
    search: vi.fn(),
    applyAdd: vi.fn(),
    loadApplications: vi.fn(),
    handleApplication: vi.fn(),
    loadContacts: vi.fn(),
    getContactUserInfo: vi.fn(),
    deleteContact: vi.fn(),
    blockContact: vi.fn(),
  },
}))

const friend: UserContactEntry = {
  userId: 'U100',
  contactId: 'U200',
  contactType: 0,
  status: 1,
  contactName: 'Friend',
}

const profile: ContactProfile = {
  userId: 'U200',
  nickName: 'Friend',
  sex: 1,
  areaName: 'Shanghai',
  personalSignature: 'Hello there',
  contactStatus: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contactApi.loadContacts).mockResolvedValue([friend])
  vi.mocked(contactApi.getContactUserInfo).mockResolvedValue(profile)
  vi.mocked(contactApi.deleteContact).mockResolvedValue(null)
  vi.mocked(contactApi.blockContact).mockResolvedValue(null)
})

describe('contact directory dialog', () => {
  it('loads user contacts and shows safe profile details on selection', async () => {
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="contact-U200"] .contact-directory-select').trigger('click')
    await flushPromises()

    expect(contactApi.loadContacts).toHaveBeenCalledWith('USER')
    expect(contactApi.getContactUserInfo).toHaveBeenCalledWith('U200')
    expect(wrapper.get('.contact-profile-panel').text()).toContain('Hello there')
    expect(wrapper.text()).not.toContain('token')
  })

  it('requires confirmation before deleting a friend and refreshes the list', async () => {
    vi.mocked(contactApi.loadContacts).mockResolvedValueOnce([friend]).mockResolvedValueOnce([])
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="delete-contact"]').trigger('click')

    expect(contactApi.deleteContact).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="confirm-contact-action"]').trigger('click')
    await flushPromises()

    expect(contactApi.deleteContact).toHaveBeenCalledWith('U200')
    expect(wrapper.emitted('contactsChanged')).toHaveLength(1)
    expect(wrapper.find('[data-testid="contacts-empty"]').exists()).toBe(true)
  })

  it('requires confirmation before blocking a friend', async () => {
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="block-contact"]').trigger('click')
    await wrapper.get('[data-testid="confirm-contact-action"]').trigger('click')
    await flushPromises()

    expect(contactApi.blockContact).toHaveBeenCalledWith('U200')
    expect(wrapper.emitted('contactsChanged')).toHaveLength(1)
  })

  it('does not show destructive controls for a contact who removed the current user', async () => {
    vi.mocked(contactApi.loadContacts).mockResolvedValue([{ ...friend, status: 3 }])
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()

    expect(wrapper.text()).toContain('对方已删除你')
    expect(wrapper.find('[data-testid="delete-contact"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="block-contact"]').exists()).toBe(false)
  })
})
