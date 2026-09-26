import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatApi } from '@/api/chat'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'

vi.mock('@/api/chat', () => ({ chatApi: { downloadFile: vi.fn() } }))

const createObjectURL = vi.fn((_blob: Blob) => 'blob:avatar-test')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chatApi.downloadFile).mockResolvedValue(new Blob(['png bytes']))
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('avatar thumbnail', () => {
  it('loads an authenticated avatar Blob and releases its object URL on unmount', async () => {
    const wrapper = mount(AvatarThumbnail, {
      props: { fileId: 'U100', fallback: 'S', testId: 'user-avatar' },
    })
    await flushPromises()

    expect(chatApi.downloadFile).toHaveBeenCalledWith('U100', false)
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('image/png')
    expect(wrapper.get('[data-testid="user-avatar"] img').attributes('src')).toBe('blob:avatar-test')

    wrapper.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar-test')
  })

  it('keeps the initials fallback when an avatar is unavailable', async () => {
    vi.mocked(chatApi.downloadFile).mockRejectedValue(new Error('missing avatar'))
    const wrapper = mount(AvatarThumbnail, { props: { fileId: 'G300', fallback: '群' } })
    await flushPromises()

    expect(wrapper.text()).toBe('群')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('reloads a cover when its refresh key changes', async () => {
    const wrapper = mount(AvatarThumbnail, {
      props: { fileId: 'G300', fallback: '群', showCover: true, refreshKey: 0 },
    })
    await flushPromises()
    await wrapper.setProps({ refreshKey: 1 })
    await flushPromises()

    expect(chatApi.downloadFile).toHaveBeenNthCalledWith(1, 'G300', true)
    expect(chatApi.downloadFile).toHaveBeenNthCalledWith(2, 'G300', true)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar-test')
  })

  it('ignores an older response after the requested avatar changes', async () => {
    let finishFirstRequest: (blob: Blob) => void = () => undefined
    vi.mocked(chatApi.downloadFile)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstRequest = resolve }))
      .mockResolvedValueOnce(new Blob(['new avatar']))
    const wrapper = mount(AvatarThumbnail, { props: { fileId: 'U100', fallback: 'A' } })
    await wrapper.setProps({ fileId: 'U200' })
    await flushPromises()
    finishFirstRequest(new Blob(['old avatar']))
    await flushPromises()

    expect(wrapper.find('img').exists()).toBe(true)
    expect(createObjectURL).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
