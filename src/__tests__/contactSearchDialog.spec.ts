import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type ContactSearchResult } from '@/api/contacts'
import ContactSearchDialog from '@/components/ContactSearchDialog.vue'

vi.mock('@/api/contacts', () => ({
  contactApi: {
    search: vi.fn(),
    applyAdd: vi.fn(),
  },
}))

const result: ContactSearchResult = {
  contactId: 'U200',
  contactType: 'USER',
  nickName: 'Friend',
  status: null,
  areaName: 'Shanghai',
}

beforeEach(() => {
  vi.clearAllMocks()
})

function mountDialog() {
  return mount(ContactSearchDialog, {
    props: { currentUserId: 'U100', displayName: 'Student' },
  })
}

describe('contact search dialog', () => {
  it('validates the user ID before calling the backend', async () => {
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('G200')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')

    expect(contactApi.search).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('以 U 开头')
  })

  it('searches for a user and submits the optional greeting', async () => {
    vi.mocked(contactApi.search).mockResolvedValue(result)
    vi.mocked(contactApi.applyAdd).mockResolvedValue(1)
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('U200')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')
    await flushPromises()

    expect(contactApi.search).toHaveBeenCalledWith('U200')
    expect(wrapper.get('[data-testid="contact-result"]').text()).toContain('Friend')
    await wrapper.get('[data-testid="contact-apply-info"]').setValue('你好')
    await wrapper.get('[data-testid="contact-request-form"]').trigger('submit')
    await flushPromises()

    expect(contactApi.applyAdd).toHaveBeenCalledWith('U200', '你好')
    expect(wrapper.get('[role="status"]').text()).toContain('等待对方处理')
    expect(wrapper.emitted('contactAdded')).toBeUndefined()
    expect(wrapper.find('[data-testid="send-contact-request"]').exists()).toBe(false)
  })

  it('refreshes the chat after a directly accepted friend request', async () => {
    vi.mocked(contactApi.search).mockResolvedValue(result)
    vi.mocked(contactApi.applyAdd).mockResolvedValue(0)
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('U200')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="contact-request-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toContain('直接添加为好友')
    expect(wrapper.emitted('contactAdded')).toHaveLength(1)
    expect(wrapper.find('[data-testid="send-contact-request"]').exists()).toBe(false)
  })

  it('does not offer an add action for an existing friend', async () => {
    vi.mocked(contactApi.search).mockResolvedValue({ ...result, status: 1, statusName: '好友' })
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('U200')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('已经是好友')
    expect(wrapper.find('[data-testid="send-contact-request"]').exists()).toBe(false)
  })

  it('clears the previous result as soon as the search ID changes', async () => {
    vi.mocked(contactApi.search).mockResolvedValue(result)
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('U200')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-testid="contact-result"]').exists()).toBe(true)

    await wrapper.get('[data-testid="contact-id-search"]').setValue('U201')
    expect(wrapper.find('[data-testid="contact-result"]').exists()).toBe(false)
  })

  it('shows an empty state when the backend returns no contact', async () => {
    vi.mocked(contactApi.search).mockResolvedValue(null)
    const wrapper = mountDialog()
    await wrapper.get('[data-testid="contact-id-search"]').setValue('U404')
    await wrapper.get('[data-testid="contact-search-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="contact-not-found"]').text()).toContain('没有找到')
  })
})
