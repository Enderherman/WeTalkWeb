import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import AboutView from '@/views/AboutView.vue'

describe('about view', () => {
  it('shows the client version and browser security/storage notes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/about', name: 'about', component: AboutView },
        { path: '/chat', name: 'chat', component: { template: '<div>chat</div>' } },
      ],
    })
    await router.push('/about')
    await router.isReady()
    const wrapper = mount(AboutView, { global: { plugins: [router] } })

    expect(wrapper.get('[data-testid="web-version"]').text()).toBe('0.1.0')
    expect(wrapper.text()).toContain('HttpOnly Cookie')
    expect(wrapper.text()).toContain('不保存附件或登录 token')
    await wrapper.get('[data-testid="about-back"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('chat')
  })
})
