import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type ContactProfile, type UserContactEntry } from '@/api/contacts'
import ContactDirectoryDialog from '@/components/ContactDirectoryDialog.vue'
import { chatApi } from '@/api/chat'

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
    saveRemark: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

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
  vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('Avatar unavailable in unit tests'))
  vi.mocked(contactApi.loadContacts).mockResolvedValue([friend])
  vi.mocked(contactApi.getContactUserInfo).mockResolvedValue(profile)
  vi.mocked(contactApi.deleteContact).mockResolvedValue(null)
  vi.mocked(contactApi.blockContact).mockResolvedValue(null)
})

describe('contact directory dialog', () => {
  it('offers direct chat only for active friends and emits the selected contact ID', async () => {
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('[data-testid="start-contact-chat-U200"]').trigger('click')
    expect(wrapper.emitted('startChat')).toEqual([['U200']])
    await wrapper.setProps({ chattingContactId: 'U200' })
    expect(wrapper.get('[data-testid="start-contact-chat-U200"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
    vi.mocked(contactApi.loadContacts).mockResolvedValue([{ ...friend, status: 3 }])
    const removed = mount(ContactDirectoryDialog)
    await flushPromises()
    expect(removed.find('[data-testid="start-contact-chat-U200"]').exists()).toBe(false)
    removed.unmount()
  })

  it('saves a trimmed remark, filters by it and keeps the original nickname visible', async () => {
    vi.mocked(contactApi.saveRemark).mockResolvedValue({ contactId: 'U200', remark: '同事' })
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('.contact-directory-select').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="contact-remark"]').setValue(' 同事 ')
    await wrapper.get('[data-testid="contact-remark-form"]').trigger('submit')
    await flushPromises()
    expect(contactApi.saveRemark).toHaveBeenCalledWith('U200', '同事')
    expect(wrapper.emitted('remarkSaved')).toEqual([['U200', '同事']])
    expect(wrapper.get('[data-testid="contact-U200"]').text()).toContain('同事')
    expect(wrapper.get('.contact-profile-details').text()).toContain('Friend')
    await wrapper.get('[data-testid="contact-directory-filter"]').setValue('同事')
    expect(wrapper.find('[data-testid="contact-U200"]').exists()).toBe(true)
    await wrapper.get('[data-testid="contact-directory-filter"]').setValue('absent')
    expect(wrapper.text()).toContain('没有匹配的好友')
    wrapper.unmount()
  })

  it('keeps a failed remark draft and allows clearing it after retry', async () => {
    vi.mocked(contactApi.saveRemark).mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce({ contactId: 'U200', remark: '' })
    const wrapper = mount(ContactDirectoryDialog)
    await flushPromises()
    await wrapper.get('.contact-directory-select').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="contact-remark"]').setValue('Draft')
    await wrapper.get('[data-testid="contact-remark-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Save failed')
    expect((wrapper.get('[data-testid="contact-remark"]').element as HTMLInputElement).value).toBe('Draft')
    await wrapper.get('[data-testid="contact-remark"]').setValue('')
    await wrapper.get('[data-testid="contact-remark-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('remarkSaved')).toEqual([['U200', '']])
    wrapper.unmount()
  })

  it('updates a displayed remark from another device without replacing an unsaved draft', async () => {
    const wrapper = mount(ContactDirectoryDialog, { props: { remarks: { U200: 'Old' } } })
    await flushPromises()
    await wrapper.get('.contact-directory-select').trigger('click')
    await flushPromises()
    await wrapper.setProps({ remarks: { U200: 'From desktop' } })
    expect((wrapper.get('[data-testid="contact-remark"]').element as HTMLInputElement).value).toBe('From desktop')
    await wrapper.get('[data-testid="contact-remark"]').setValue('Unsaved draft')
    await wrapper.setProps({ remarks: { U200: 'New remote' } })
    expect((wrapper.get('[data-testid="contact-remark"]').element as HTMLInputElement).value).toBe('Unsaved draft')
    expect(wrapper.get('[data-testid="contact-U200"] strong').text()).toBe('New remote')
    wrapper.unmount()
  })

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

  it('keeps keyboard focus inside the contacts dialog and restores its opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(ContactDirectoryDialog)
    document.body.appendChild(wrapper.element)
    await flushPromises()

    const dialog = wrapper.get('.contacts-directory-dialog')
    const closeButton = wrapper.get('[aria-label="关闭联系人"]')
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
