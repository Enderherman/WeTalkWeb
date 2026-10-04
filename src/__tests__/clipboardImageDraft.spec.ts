import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClipboardImageDraft from '@/components/ClipboardImageDraft.vue'
import { DEFAULT_SYSTEM_SETTINGS } from '@/api/systemSettings'

function pasteEvent(files: File[], text = '') {
  return { clipboardData: { items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
    files, getData: () => text }, preventDefault: vi.fn() } as unknown as ClipboardEvent
}

describe('clipboard image draft', () => {
  const createUrl = vi.fn(() => 'blob:clipboard-test')
  const revokeUrl = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }))
    vi.clearAllMocks()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('previews without uploading, emits a confirmed image, and releases the object URL', async () => {
    const wrapper = mount(ClipboardImageDraft, { props: { contactId: 'U2', disabled: false, settings: DEFAULT_SYSTEM_SETTINGS } })
    try {
      wrapper.vm.paste(pasteEvent([new File(['image'], 'ignored', { type: 'image/png' })]))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('img').exists()).toBe(true)
      expect(wrapper.emitted('send')).toBeUndefined()
      await wrapper.get('[data-testid="send-clipboard-image"]').trigger('click')
      const file = wrapper.emitted('send')?.[0]?.[0] as File
      expect(file.type).toBe('image/png')
      expect(file.name).toMatch(/\.png$/)
      expect(file.size).toBe(5)
      expect(revokeUrl).toHaveBeenCalledWith('blob:clipboard-test')
      expect(wrapper.find('img').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('keeps ordinary text paste and refuses unsupported or over-limit images', async () => {
    const wrapper = mount(ClipboardImageDraft, { props: { contactId: 'U2', disabled: false, settings: { ...DEFAULT_SYSTEM_SETTINGS, maxImageSize: 1 } } })
    try {
      const text = pasteEvent([], 'hello')
      wrapper.vm.paste(text)
      expect(text.preventDefault).not.toHaveBeenCalled()
      wrapper.vm.paste(pasteEvent([new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })]))
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('PNG')
      wrapper.vm.paste(pasteEvent([new File([new Uint8Array(1024 * 1024 + 1)], 'x.png', { type: 'image/png' })]))
      await wrapper.vm.$nextTick()
      expect(wrapper.find('img').exists()).toBe(false)
      expect(wrapper.text()).toContain('1 MB')
    } finally { wrapper.unmount() }
  })

  it('drops an unconfirmed image when the user switches conversations', async () => {
    const wrapper = mount(ClipboardImageDraft, { props: { contactId: 'U2', disabled: false, settings: DEFAULT_SYSTEM_SETTINGS } })
    try {
      wrapper.vm.paste(pasteEvent([new File(['image'], 'x.png', { type: 'image/png' })]))
      await wrapper.setProps({ contactId: 'U3' })
      expect(wrapper.find('img').exists()).toBe(false)
      expect(revokeUrl).toHaveBeenCalledOnce()
      expect(wrapper.emitted('send')).toBeUndefined()
    } finally { wrapper.unmount() }
  })
})
