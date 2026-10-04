import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmojiPicker from '@/components/EmojiPicker.vue'

describe('emoji picker', () => {
  it('supports keyboard focus, Escape, selection and disabled state', async () => {
    const wrapper = mount(EmojiPicker, { attachTo: document.body })
    try {
      await wrapper.get('[aria-label="选择表情"]').trigger('click')
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[aria-label="开心"]').element)
      await wrapper.get('[aria-label="开心"]').trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[aria-label="选择表情"]').element)
      expect(wrapper.find('[role="group"]').exists()).toBe(false)
      await wrapper.get('[aria-label="选择表情"]').trigger('click')
      await wrapper.get('[aria-label="赞"]').trigger('click')
      expect(wrapper.emitted('select')).toEqual([['👍']])
      await wrapper.setProps({ disabled: true })
      expect(wrapper.get('[aria-label="选择表情"]').attributes('disabled')).toBeDefined()
    } finally { wrapper.unmount() }
  })
})
