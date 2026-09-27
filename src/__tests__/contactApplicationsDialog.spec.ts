import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contactApi, type ContactApplication, type ContactApplicationsPage } from '@/api/contacts'
import ContactApplicationsDialog from '@/components/ContactApplicationsDialog.vue'

vi.mock('@/api/contacts', () => ({
  contactApi: {
    search: vi.fn(),
    applyAdd: vi.fn(),
    loadApplications: vi.fn(),
    handleApplication: vi.fn(),
  },
}))

const application: ContactApplication = {
  applyId: 91,
  applyUserId: 'U200',
  receiveUserId: 'U100',
  contactType: 0,
  contactId: 'U100',
  lastApplyTime: 1_780_000_000_000,
  status: 0,
  applyInfo: '你好，想加你为好友',
  statusName: '待处理',
  contactName: 'Friend',
}

const emptyPage: ContactApplicationsPage = {
  totalCount: 0,
  pageSize: 15,
  pageNo: 1,
  pageTotal: 0,
  list: [],
}

function page(list: ContactApplication[] = [application], pageNo = 1, pageTotal = 1): ContactApplicationsPage {
  return { totalCount: list.length, pageSize: 15, pageNo, pageTotal, list }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(contactApi.loadApplications).mockResolvedValue(page())
  vi.mocked(contactApi.handleApplication).mockResolvedValue(null)
})

describe('contact applications dialog', () => {
  it('loads and displays received application details', async () => {
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()

    expect(contactApi.loadApplications).toHaveBeenCalledWith(1)
    expect(wrapper.get('[data-testid="application-91"]').text()).toContain('U200')
    expect(wrapper.get('[data-testid="application-91"]').text()).toContain('你好，想加你为好友')
  })

  it('accepts a friend request and emits a refresh event', async () => {
    vi.mocked(contactApi.loadApplications)
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page([{ ...application, status: 1, statusName: '已同意' }]))
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()
    await wrapper.get('[data-testid="accept-application"]').trigger('click')
    await flushPromises()

    expect(contactApi.handleApplication).toHaveBeenCalledWith(91, 1)
    expect(wrapper.emitted('applicationHandled')).toHaveLength(1)
    expect(wrapper.get('[role="status"]').text()).toContain('已同意好友申请')
    expect(wrapper.get('[data-testid="application-status"]').text()).toBe('已同意')
    expect(wrapper.find('[data-testid="accept-application"]').exists()).toBe(false)
  })

  it('blocks the applicant using the backend status code', async () => {
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()
    await wrapper.get('[data-testid="block-application"]').trigger('click')
    await flushPromises()

    expect(contactApi.handleApplication).toHaveBeenCalledWith(91, 3)
  })

  it('rejects a friend request using the backend status code', async () => {
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()
    await wrapper.get('[data-testid="reject-application"]').trigger('click')
    await flushPromises()

    expect(contactApi.handleApplication).toHaveBeenCalledWith(91, 2)
    expect(wrapper.get('[role="status"]').text()).toContain('已拒绝好友申请')
  })

  it('labels an accepted group request as an invite to join the group', async () => {
    const groupApplication: ContactApplication = {
      ...application,
      applyId: 92,
      contactType: 1,
      contactId: 'G300',
      contactName: 'Study Group',
    }
    vi.mocked(contactApi.loadApplications)
      .mockResolvedValueOnce(page([groupApplication]))
      .mockResolvedValueOnce(page([{ ...groupApplication, status: 1, statusName: '已同意' }]))
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()
    await wrapper.get('[data-testid="accept-application"]').trigger('click')
    await flushPromises()

    expect(contactApi.handleApplication).toHaveBeenCalledWith(92, 1)
    expect(wrapper.get('[role="status"]').text()).toContain('已同意入群申请')
  })

  it('loads the next page when requested', async () => {
    vi.mocked(contactApi.loadApplications)
      .mockResolvedValueOnce(page([application], 1, 2))
      .mockResolvedValueOnce(page([], 2, 2))
    const wrapper = mount(ContactApplicationsDialog)
    await flushPromises()
    await wrapper.get('.applications-pagination button:last-child').trigger('click')
    await flushPromises()

    expect(contactApi.loadApplications).toHaveBeenLastCalledWith(2)
    expect(wrapper.text()).toContain('第 2 / 2 页')
  })

  it('keeps keyboard focus inside the applications dialog and restores its opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const wrapper = mount(ContactApplicationsDialog)
    document.body.appendChild(wrapper.element)
    await flushPromises()

    const dialog = wrapper.get('.applications-dialog')
    const closeButton = wrapper.get('[aria-label="关闭好友申请"]')
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
