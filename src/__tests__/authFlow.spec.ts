import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import type { AuthUser } from '@/api/auth'
import App from '@/App.vue'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'
import AuthView from '@/views/AuthView.vue'
import ChatHome from '@/views/ChatHome.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/api/auth', () => ({
  authApi: {
    getCaptcha: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    getUserInfo: vi.fn(),
    updatePassword: vi.fn(),
    logout: vi.fn(),
  },
}))

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: AuthView },
      { path: '/register', name: 'register', component: AuthView },
      { path: '/chat', name: 'chat', component: ChatHome },
    ],
  })
}

async function mountAuth(path: '/login' | '/register') {
  const pinia = createPinia()
  const router = createTestRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AuthView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, pinia }
}

async function mountChat() {
  const pinia = createPinia()
  const router = createTestRouter()
  await router.push('/chat')
  await router.isReady()
  const authStore = useAuthStore(pinia)
  authStore.setSession({
    token: 'web-token',
    userId: 'U100',
    email: 'old@example.com',
    nickName: 'Old Name',
    admin: false,
  })
  const wrapper = mount(ChatHome, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router, pinia, authStore }
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
  vi.mocked(authApi.getCaptcha).mockResolvedValue({
    check_code: 'data:image/png;base64,ZmFrZQ==',
    check_code_key: 'captcha-key',
  })
  vi.mocked(authApi.getUserInfo).mockResolvedValue({
    userId: 'U100',
    email: 'student@example.com',
    nickName: 'Student',
    admin: false,
  })
  vi.mocked(authApi.updatePassword).mockResolvedValue(undefined)
})

describe('authentication flow', () => {
  it('shows the password changed notice on the login page', async () => {
    const pinia = createPinia()
    const router = createTestRouter()
    await router.push({ name: 'login', query: { passwordUpdated: '1' } })
    await router.isReady()
    const wrapper = mount(AuthView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('密码已修改，请使用新密码登录')
  })

  it('clears an expired session and shows the re-login notice', async () => {
    const pinia = createPinia()
    const router = createTestRouter()
    const authStore = useAuthStore(pinia)
    authStore.setSession({
      token: 'expired-token',
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    })
    await router.push('/chat')
    const wrapper = mount(App, { global: { plugins: [pinia, router] } })
    await flushPromises()

    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    await flushPromises()

    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.expired).toBe('1')
    expect(wrapper.text()).toContain('登录状态已过期，请重新登录')
    wrapper.unmount()
  })

  it('loads the backend image captcha on the login page', async () => {
    const { wrapper } = await mountAuth('/login')
    expect(authApi.getCaptcha).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="captcha-refresh"] img').attributes('src')).toContain('base64,ZmFrZQ==')
  })

  it('submits registration fields and returns to login after success', async () => {
    vi.mocked(authApi.register).mockResolvedValue(undefined)
    const { wrapper, router } = await mountAuth('/register')

    await wrapper.get('[data-testid="nickname"]').setValue('Student')
    await wrapper.get('[data-testid="email"]').setValue('student@example.com')
    await wrapper.get('[data-testid="password"]').setValue('WeTalk123')
    await wrapper.get('[data-testid="confirm-password"]').setValue('WeTalk123')
    await wrapper.get('[data-testid="captcha"]').setValue('9')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'student@example.com',
      nickName: 'Student',
      password: 'WeTalk123',
      checkCodeKey: 'captcha-key',
      checkCode: '9',
    })
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.registered).toBe('1')
  })

  it('stores the returned session and opens the authenticated shell after login', async () => {
    const user: AuthUser = {
      token: 'web-token',
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    }
    vi.mocked(authApi.login).mockResolvedValue(user)
    const { wrapper, router, pinia } = await mountAuth('/login')

    await wrapper.get('[data-testid="email"]').setValue('student@example.com')
    await wrapper.get('[data-testid="password"]').setValue('WeTalk123')
    await wrapper.get('[data-testid="captcha"]').setValue('9')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'WeTalk123',
      checkCodeKey: 'captcha-key',
      checkCode: '9',
    })
    expect(useAuthStore(pinia).session?.token).toBe('web-token')
    expect(router.currentRoute.value.name).toBe('chat')
  })

  it('does not call the API for invalid input', async () => {
    const { wrapper } = await mountAuth('/login')
    await wrapper.get('[data-testid="email"]').setValue('bad-email')
    await wrapper.get('[data-testid="password"]').setValue('short')
    await wrapper.get('[data-testid="captcha"]').setValue('9')
    await wrapper.get('form').trigger('submit')

    expect(authApi.login).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入有效的邮箱地址')
  })

  it('clears the local session when the user signs out', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    const pinia = createPinia()
    const router = createTestRouter()
    await router.push('/chat')
    await router.isReady()
    const authStore = useAuthStore(pinia)
    authStore.setSession({
      token: 'web-token',
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    })
    const wrapper = mount(ChatHome, { global: { plugins: [pinia, router] } })

    await wrapper.get('[data-testid="signout"]').trigger('click')
    await flushPromises()

    expect(authApi.logout).toHaveBeenCalledOnce()
    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('loads current profile details and refreshes the stored account summary', async () => {
    vi.mocked(authApi.getUserInfo).mockResolvedValue({
      userId: 'U100',
      email: 'current@example.com',
      nickName: 'Current Name',
      admin: true,
    })
    const { wrapper, authStore } = await mountChat()

    await wrapper.get('[data-testid="open-profile"]').trigger('click')

    expect(authApi.getUserInfo).toHaveBeenCalledOnce()
    expect(wrapper.get('.profile-dialog').text()).toContain('current@example.com')
    expect(wrapper.get('.profile-dialog').text()).toContain('Current Name')
    expect(authStore.session?.nickName).toBe('Current Name')
    expect(authStore.session?.admin).toBe(true)
  })

  it('rejects mismatched passwords before calling the backend', async () => {
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-profile"]').trigger('click')
    await wrapper.get('[data-testid="new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="confirm-new-password"]').setValue('Different123')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')

    expect(authApi.updatePassword).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="password-error"]').text()).toBe('两次输入的密码不一致')
  })

  it('clears the session after a password change and asks the user to log in again', async () => {
    const { wrapper, router, authStore } = await mountChat()
    await wrapper.get('[data-testid="open-profile"]').trigger('click')
    await wrapper.get('[data-testid="new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="confirm-new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')
    await flushPromises()

    expect(authApi.updatePassword).toHaveBeenCalledWith('NewPassword123')
    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.passwordUpdated).toBe('1')
  })
})
