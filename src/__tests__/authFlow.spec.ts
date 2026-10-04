import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chatApi } from '@/api/chat'
import { appUpdateApi } from '@/api/appUpdates'
import { authApi } from '@/api/auth'
import { contactApi } from '@/api/contacts'
import { createVideoCover } from '@/utils/videoThumbnail'
import type { WebAuthSession } from '@/api/auth'
import App from '@/App.vue'
import { createRealtimeClient } from '@/api/realtime'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'
import AuthView from '@/views/AuthView.vue'
import ChatHome from '@/views/ChatHome.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { textMessageCache } from '@/storage/textMessageCache'

const mountedChatCleanup = new Set<() => void>()

afterEach(() => {
  for (const cleanup of [...mountedChatCleanup]) cleanup()
})

const { downloadPreferences } = vi.hoisted(() => ({
  downloadPreferences: {
    accountId: '',
    mode: 'browser' as 'browser' | 'ask' | 'folder',
    directoryHandle: null as unknown,
    directoryName: '',
    loading: false,
    loaded: true,
    storageError: '',
    supportsSavePicker: false,
    supportsDirectoryPicker: false,
    load: vi.fn(),
    setMode: vi.fn(),
    chooseDirectory: vi.fn(),
    clearDirectory: vi.fn(),
    prepareDestination: vi.fn(),
    reset: vi.fn(),
  },
}))

vi.mock('@/api/auth', () => ({
  authApi: {
    getCaptcha: vi.fn(),
    sendRegistrationEmailCode: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    createWebSocketTicket: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
    getUserInfo: vi.fn(),
    getSystemSettings: vi.fn(),
    saveUserInfo: vi.fn(),
    updatePassword: vi.fn(),
    logout: vi.fn(),
  },
}))

vi.mock('@/api/chat', () => ({
  chatApi: {
    sendTextMessage: vi.fn(),
    markRead: vi.fn(),
    cancelAiMessage: vi.fn(),
    sendFileMessage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    streamMediaUrl: vi.fn(),
    loadHistory: vi.fn(),
  },
}))

vi.mock('@/api/appUpdates', () => ({
  appUpdateApi: { checkForUpdate: vi.fn() },
}))

vi.mock('@/utils/videoThumbnail', () => ({
  createVideoCover: vi.fn(),
}))

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

vi.mock('@/api/realtime', () => ({
  createRealtimeClient: vi.fn(() => ({ disconnect: vi.fn() })),
}))

vi.mock('@/stores/downloadPreferences', () => ({ useDownloadPreferencesStore: () => downloadPreferences }))

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
  const chatStore = useChatStore(pinia)
  authStore.setSession({
    token: '',
    userId: 'U100',
    email: 'old@example.com',
    nickName: 'Old Name',
    admin: false,
  })
  const wrapper = mount(ChatHome, { global: { plugins: [pinia, router] } })
  let mounted = true
  const unmount = wrapper.unmount.bind(wrapper)
  const cleanup = () => {
    if (!mounted) return
    mounted = false
    mountedChatCleanup.delete(cleanup)
    unmount()
    wrapper.element.remove()
  }
  wrapper.unmount = cleanup
  mountedChatCleanup.add(cleanup)
  await flushPromises()
  return { wrapper, router, pinia, authStore, chatStore }
}

async function openProfileDialog(wrapper: Awaited<ReturnType<typeof mountChat>>['wrapper']) {
  await wrapper.get('[data-testid="profile-menu-trigger"]').trigger('click')
  await wrapper.get('[data-testid="open-profile"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
  downloadPreferences.mode = 'browser'
  downloadPreferences.directoryName = ''
  downloadPreferences.loading = false
  downloadPreferences.loaded = true
  downloadPreferences.storageError = ''
  downloadPreferences.supportsSavePicker = false
  downloadPreferences.supportsDirectoryPicker = false
  downloadPreferences.load.mockResolvedValue(undefined)
  downloadPreferences.setMode.mockImplementation(async (mode: 'browser' | 'ask' | 'folder') => {
    downloadPreferences.mode = mode
  })
  downloadPreferences.chooseDirectory.mockResolvedValue('QA folder')
  downloadPreferences.clearDirectory.mockResolvedValue(undefined)
  downloadPreferences.prepareDestination.mockResolvedValue(null)
  downloadPreferences.reset.mockImplementation(() => {
    downloadPreferences.mode = 'browser'
  })
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
  vi.mocked(authApi.getSystemSettings).mockResolvedValue({
    maxGroupCount: 5,
    maxGroupMemberCount: 500,
    maxImageSize: 200,
    maxVideoSize: 500,
    maxFileSize: 5000,
    robotUid: 'Urobot',
    robotNickName: 'WeTalk Robot',
    robotWelcome: 'Welcome to WeTalk',
  })
  vi.mocked(authApi.saveUserInfo).mockResolvedValue({
    userId: 'U100', email: 'student@example.com', nickName: 'Student', admin: false,
  })
  vi.mocked(authApi.updatePassword).mockResolvedValue(undefined)
  vi.mocked(authApi.listSessions).mockResolvedValue([])
  vi.mocked(authApi.revokeSession).mockResolvedValue(undefined)
  vi.mocked(authApi.revokeOtherSessions).mockResolvedValue({ revokedCount: 0 })
  vi.mocked(contactApi.loadApplications).mockResolvedValue({ totalCount: 0, pageSize: 15, pageNo: 1, pageTotal: 0, list: [] })
  vi.mocked(contactApi.handleApplication).mockResolvedValue(null)
  vi.mocked(contactApi.loadContacts).mockResolvedValue([])
  vi.mocked(contactApi.loadOwnedGroups).mockResolvedValue([])
  vi.mocked(contactApi.getContactUserInfo).mockResolvedValue({ userId: 'U200' })
  vi.mocked(contactApi.getGroupInfo).mockResolvedValue({
    groupId: 'G300', groupName: 'Group', groupOwnId: 'U100', joinType: 1, status: 1, memberCount: 1,
  })
  vi.mocked(contactApi.deleteContact).mockResolvedValue(null)
  vi.mocked(contactApi.blockContact).mockResolvedValue(null)
  vi.mocked(chatApi.loadHistory).mockResolvedValue({
    pageNo: 1,
    pageSize: 30,
    pageTotal: 1,
    totalCount: 0,
    list: [],
  })
  vi.mocked(appUpdateApi.checkForUpdate).mockResolvedValue(null)
  vi.mocked(createVideoCover).mockResolvedValue(null)
  vi.mocked(chatApi.streamMediaUrl).mockReturnValue(null)
  vi.mocked(chatApi.sendFileMessage).mockResolvedValue({
    messageId: 601,
    sessionId: 'S200',
    messageType: 5,
    messageContent: '[文件]',
    sendUserId: 'U100',
    sendUserNickName: 'Old Name',
    sendTime: 2000,
    contactId: 'U200',
    fileName: 'notes.txt',
    fileSize: 5,
    fileType: 2,
    status: 0,
  })
  vi.mocked(chatApi.uploadFile).mockResolvedValue('上传成功')
  vi.mocked(chatApi.downloadFile).mockResolvedValue(new Blob(['file bytes'], { type: 'application/octet-stream' }))
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
    await wrapper.get('[data-testid="email-code"]').setValue('123456')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(authApi.register).toHaveBeenCalledWith({
      email: 'student@example.com',
      nickName: 'Student',
      password: 'WeTalk123',
      emailCode: '123456',
    })
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.registered).toBe('1')
  })

  it('sends an email code after checking the address and image captcha', async () => {
    vi.mocked(authApi.sendRegistrationEmailCode).mockResolvedValue(undefined)
    const { wrapper } = await mountAuth('/register')
    await wrapper.get('[data-testid="email"]').setValue('student@example.com')
    await wrapper.get('[data-testid="captcha"]').setValue('9')

    try {
      await wrapper.get('[data-testid="send-email-code"]').trigger('click')
      await flushPromises()

      expect(authApi.sendRegistrationEmailCode).toHaveBeenCalledWith({
        email: 'student@example.com',
        checkCodeKey: 'captcha-key',
        checkCode: '9',
      })
      expect(wrapper.get('[data-testid="email-code-notice"]').text()).toContain('验证码已发送')
      expect(wrapper.get('[data-testid="send-email-code"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="send-email-code"]').text()).toContain('60 秒后重发')
      expect(authApi.getCaptcha).toHaveBeenCalledTimes(2)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
    }
  })

  it('unlocks the email code button when the resend cooldown expires', async () => {
    vi.mocked(authApi.sendRegistrationEmailCode).mockResolvedValue(undefined)
    const { wrapper } = await mountAuth('/register')
    await wrapper.get('[data-testid="email"]').setValue('student@example.com')
    await wrapper.get('[data-testid="captcha"]').setValue('9')

    try {
      vi.useFakeTimers()
      await wrapper.get('[data-testid="send-email-code"]').trigger('click')
      await flushPromises()

      const button = wrapper.get('[data-testid="send-email-code"]')
      expect(button.attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(60_000)
      await flushPromises()
      expect(button.attributes('disabled')).toBeUndefined()
      expect(button.text()).toBe('发送验证码')
      expect(authApi.sendRegistrationEmailCode).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
      vi.useRealTimers()
    }
  })

  it('shows the mail service error and permits retry when sending fails', async () => {
    vi.mocked(authApi.sendRegistrationEmailCode).mockRejectedValue(new Error('邮件服务暂不可用'))
    const { wrapper } = await mountAuth('/register')
    await wrapper.get('[data-testid="email"]').setValue('student@example.com')
    await wrapper.get('[data-testid="captcha"]').setValue('9')

    try {
      await wrapper.get('[data-testid="send-email-code"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[role="alert"]').text()).toContain('邮件服务暂不可用')
      expect(wrapper.get('[data-testid="send-email-code"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('[data-testid="email-code-notice"]').exists()).toBe(false)
      expect(authApi.getCaptcha).toHaveBeenCalledTimes(2)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
    }
  })

  it('stores the returned session and opens the authenticated shell after login', async () => {
    const user: WebAuthSession = {
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
    expect(useAuthStore(pinia).session?.token).toBe('')
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
    expect(wrapper.get('[data-testid="email"]').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('[data-testid="email"]').attributes('aria-describedby')).toBe('email-error')
    expect(wrapper.get('#email-error').attributes('role')).toBe('alert')
    expect(wrapper.get('[data-testid="password"]').attributes('aria-describedby')).toBe('password-error')
    expect(wrapper.get('#password-error').attributes('role')).toBe('alert')
  })

  it('clears the local session when the user signs out', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    const pinia = createPinia()
    const router = createTestRouter()
    await router.push('/chat')
    await router.isReady()
    const authStore = useAuthStore(pinia)
    authStore.setSession({
      token: '',
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'Student',
      admin: false,
    })
    const wrapper = mount(ChatHome, { global: { plugins: [pinia, router] } })

    const avatarTrigger = wrapper.get('[data-testid="profile-menu-trigger"]')
    await avatarTrigger.trigger('click')
    expect(avatarTrigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="profile-actions-menu"]').text()).toContain('退出登录')
    expect(wrapper.find('.signout-button').exists()).toBe(false)
    await wrapper.get('[data-testid="signout"]').trigger('click')
    await flushPromises()

    expect(authApi.logout).toHaveBeenCalledOnce()
    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('closes the avatar menu with Escape and restores focus to the avatar', async () => {
    const { wrapper } = await mountChat()
    document.body.appendChild(wrapper.element)
    const avatarTrigger = wrapper.get('[data-testid="profile-menu-trigger"]')
    expect(avatarTrigger.attributes('aria-haspopup')).toBe('menu')
    expect(avatarTrigger.attributes('aria-controls')).toBe('profile-actions-menu')

    await avatarTrigger.trigger('click')
    await flushPromises()

    const menu = wrapper.get('[data-testid="profile-actions-menu"]')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="open-profile"]').element)
    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.find('[data-testid="profile-actions-menu"]').exists()).toBe(false)
    expect(avatarTrigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(avatarTrigger.element)
  })

  it('loads current profile details and refreshes the stored account summary', async () => {
    vi.mocked(authApi.getUserInfo).mockResolvedValue({
      userId: 'U100',
      email: 'current@example.com',
      nickName: 'Current Name',
      admin: true,
    })
    const { wrapper, authStore } = await mountChat()

    await openProfileDialog(wrapper)

    expect(authApi.getUserInfo).toHaveBeenCalledOnce()
    expect(wrapper.get('.profile-dialog').text()).toContain('current@example.com')
    expect(wrapper.get('.profile-dialog').text()).toContain('Current Name')
    expect(authStore.session?.nickName).toBe('Current Name')
    expect(authStore.session?.admin).toBe(true)
  })

  it('keeps profile controls visible and navigates between account sections', async () => {
    const { wrapper } = await mountChat()
    await openProfileDialog(wrapper)

    const dialog = wrapper.get('.profile-dialog')
    const toolbar = wrapper.get('[data-testid="profile-dialog-toolbar"]')
    const content = wrapper.get('[data-testid="profile-dialog-content"]')
    expect(toolbar.element.contains(wrapper.get('.profile-close').element)).toBe(true)
    expect(content.element.contains(wrapper.get('.profile-close').element)).toBe(false)
    expect(dialog.element.contains(toolbar.element)).toBe(true)
    expect(wrapper.get('[data-testid="profile-section-tab-account"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-testid="profile-section-tab-security"]').trigger('click')

    expect(wrapper.get('[data-testid="profile-section-tab-security"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="profile-section-tab-account"]').attributes('aria-pressed')).toBe('false')
    expect(content.element.contains(wrapper.get('[data-testid="password-form"]').element)).toBe(true)
  })

  it('exposes per-account download preferences and saves the selected mode', async () => {
    downloadPreferences.supportsSavePicker = true
    downloadPreferences.supportsDirectoryPicker = true
    const { wrapper } = await mountChat()
    await openProfileDialog(wrapper)

    expect(wrapper.get('[data-testid="download-preferences"]').text()).toContain('文件下载位置')
    await wrapper.get('[data-testid="download-location-mode"]').setValue('ask')
    await flushPromises()

    expect(downloadPreferences.setMode).toHaveBeenCalledWith('ask')
    expect(wrapper.get('[data-testid="download-preferences"]').text()).toContain('下载偏好已保存')
  })

  it('renders the AI initialization, cumulative stream, and final answer as one assistant message', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'Srobot',
          contactId: 'Urobot',
          contactName: 'WeTalk Robot',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    await wrapper.get('[data-testid="chat-session-Srobot"]').trigger('click')
    await flushPromises()
    chatStore.receiveMessage({
      messageId: 90,
      sessionId: 'Srobot',
      messageType: 14,
      messageContent: '',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 2000,
      contactId: 'U100',
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="ai-waiting"]').text()).toContain('正在思考')

    chatStore.receiveMessage({
      messageId: 90,
      sessionId: 'Srobot',
      messageType: 15,
      messageContent: 'Hello',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 3000,
      contactId: 'U100',
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="message-90"] .ai-message-content').text()).toContain('Hello')
    expect(wrapper.find('[data-testid="message-90"] .ai-stream-cursor').exists()).toBe(true)

    chatStore.receiveMessage({
      messageId: 90,
      sessionId: 'Srobot',
      messageType: 16,
      messageContent: 'Hello from WeTalk',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 4000,
      contactId: 'U100',
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="message-90"] .ai-message-content').text()).toContain('Hello from WeTalk')
    expect(wrapper.find('[data-testid="message-90"] .ai-stream-cursor').exists()).toBe(false)
    expect(wrapper.get('[data-testid="message-90"]').findAll('p')).toHaveLength(1)
    expect(chatStore.initialMessages.filter((message) => message.messageId === 90)).toHaveLength(1)
  })

  it('shows a published external release note and allows dismissing the version notice', async () => {
    vi.mocked(appUpdateApi.checkForUpdate).mockResolvedValue({
      id: 18,
      version: '0.2.0',
      updateList: ['Improved messaging', 'Better mobile layout'],
      size: 0,
      fileName: '',
      fileType: 1,
      outerLink: 'https://example.invalid/releases/0.2.0',
    })
    const { wrapper } = await mountChat()
    await flushPromises()

    expect(appUpdateApi.checkForUpdate).toHaveBeenCalledWith('0.1.0')
    expect(wrapper.get('[data-testid="web-release-notice"]').text()).toContain('0.2.0')
    expect(wrapper.get('[data-testid="web-release-notice"]').text()).toContain('Improved messaging')
    expect(wrapper.get('[data-testid="web-release-notice"] a').attributes('href')).toBe('https://example.invalid/releases/0.2.0')

    await wrapper.get('[data-testid="dismiss-web-release"]').trigger('click')
    expect(wrapper.find('[data-testid="web-release-notice"]').exists()).toBe(false)
  })

  it('shows desktop release notes without exposing the installer as a web download', async () => {
    vi.mocked(appUpdateApi.checkForUpdate).mockResolvedValue({
      id: 19,
      version: '0.2.1',
      updateList: ['Security fixes'],
      size: 1024,
      fileName: 'WeTalk0.2.1.exe',
      fileType: 0,
      outerLink: '',
    })
    const { wrapper } = await mountChat()
    await flushPromises()

    expect(wrapper.get('[data-testid="web-release-notice"]').text()).toContain('网页版只展示发布说明')
    expect(wrapper.find('[data-testid="web-release-notice"] a').exists()).toBe(false)
  })

  it('rejects non-http links in a published release notice', async () => {
    vi.mocked(appUpdateApi.checkForUpdate).mockResolvedValue({
      id: 20,
      version: '0.2.2',
      updateList: ['Release notes'],
      size: 0,
      fileName: '',
      fileType: 1,
      outerLink: 'javascript:alert(1)',
    })
    const { wrapper } = await mountChat()
    await flushPromises()

    expect(wrapper.find('[data-testid="web-release-notice"] a').exists()).toBe(false)
  })

  it('stops an AI reply through the backend and renders its saved partial answer', async () => {
    vi.mocked(chatApi.cancelAiMessage).mockResolvedValue({
      messageType: 16,
      messageId: 91,
      sessionId: 'Srobot',
      contactId: 'U100',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 5000,
      messageContent: 'Partial answer',
      status: 2,
    })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'Srobot', contactId: 'Urobot', contactName: 'WeTalk Robot',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    await wrapper.get('[data-testid="chat-session-Srobot"]').trigger('click')
    chatStore.receiveMessage({
      messageType: 14, messageId: 91, sessionId: 'Srobot', contactId: 'U100',
      sendUserId: 'Urobot', sendUserNickName: 'WeTalk Robot', sendTime: 2000, messageContent: '',
    })
    chatStore.receiveMessage({
      messageType: 15, messageId: 91, sessionId: 'Srobot', contactId: 'U100',
      sendUserId: 'Urobot', sendUserNickName: 'WeTalk Robot', sendTime: 3000, messageContent: 'Partial answer',
    })
    await flushPromises()

    await wrapper.get('[data-testid="cancel-ai-91"]').trigger('click')
    await flushPromises()

    expect(chatApi.cancelAiMessage).toHaveBeenCalledWith(91)
    expect(chatStore.initialMessages.find((message) => message.messageId === 91)).toMatchObject({
      messageContent: 'Partial answer',
      aiStatus: 'cancelled',
      status: 2,
    })
    expect(wrapper.get('[data-testid="message-91"]').text()).toContain('已停止生成')
    expect(wrapper.find('[data-testid="cancel-ai-91"]').exists()).toBe(false)
  })

  it('clears only the signed-in account text cache from the profile panel', async () => {
    const clearCache = vi.spyOn(textMessageCache, 'clearAccount').mockResolvedValue(undefined)
    const { wrapper } = await mountChat()
    await openProfileDialog(wrapper)
    await wrapper.get('[data-testid="clear-text-cache"]').trigger('click')
    await flushPromises()

    expect(clearCache).toHaveBeenCalledWith('U100')
    expect(wrapper.get('.cache-status').text()).toBe('本机文字缓存已清除')
    clearCache.mockRestore()
  })

  it('starts a realtime connection for the active account using a WebSocket ticket', async () => {
    await mountChat()

    expect(createRealtimeClient).toHaveBeenCalledWith(expect.objectContaining({
      onMessage: expect.any(Function),
      onStatus: expect.any(Function),
    }))
  })

  it('shows a live unread badge until the inactive session is opened', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: ['S100', 'S200'].map((sessionId) => ({
          sessionId,
          contactId: sessionId === 'S100' ? 'U200' : 'U300',
          contactName: sessionId,
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        })),
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    chatStore.receiveMessage({
      messageId: 620,
      sessionId: 'S200',
      messageType: 2,
      messageContent: 'Unread message',
      sendUserId: 'U300',
      sendUserNickName: 'Other Friend',
      sendTime: 2000,
      contactId: 'U100',
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="session-unread-S200"]').text()).toBe('1')
    await wrapper.get('[data-testid="chat-session-S200"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="session-unread-S200"]').exists()).toBe(false)
  })

  it('searches loaded chat history by text or filename and jumps to an older result', async () => {
    const { wrapper, chatStore } = await mountChat()
    const messages = Array.from({ length: 90 }, (_, index) => ({
      messageId: index + 1,
      sessionId: 'S200',
      messageType: index === 0 ? 5 : 2,
      messageContent: index === 0 ? '[文件]' : `Message ${index + 1}`,
      sendUserId: 'U200',
      sendUserNickName: 'Friend',
      sendTime: (index + 1) * 1000,
      contactId: 'U100',
      ...(index === 0 ? { fileName: 'Needle invoice.pdf', fileType: 2, fileSize: 1024, status: 1 } : {}),
    }))
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'Message 90',
          lastReceiveTime: 90_000,
          contactType: 0,
        }],
        chatMessageList: messages,
        applyCount: 0,
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="message-1"]').exists()).toBe(false)

    await wrapper.get('[data-testid="toggle-message-search"]').trigger('click')
    await wrapper.get('[data-testid="message-search-input"]').setValue('invoice')
    expect(wrapper.get('[data-testid="message-search-result-1"]').text()).toContain('Needle invoice.pdf')
    await wrapper.get('[data-testid="message-search-result-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="message-1"]').exists()).toBe(true)
    await wrapper.get('[data-testid="return-to-latest-message"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="message-1"]').exists()).toBe(false)
  })

  it('searches every server history page and loads a remote result when selected', async () => {
    const { wrapper, chatStore } = await mountChat()
    const latestMessage = {
      messageId: 4,
      sessionId: 'S200',
      messageType: 2,
      messageContent: 'Latest message',
      sendUserId: 'U200',
      sendUserNickName: 'Friend',
      sendTime: 4000,
      contactId: 'U100',
    }
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: latestMessage.messageContent,
          lastReceiveTime: latestMessage.sendTime,
          contactType: 0,
        }],
        chatMessageList: [latestMessage],
        applyCount: 0,
      },
    })
    await flushPromises()

    const olderMatch = {
      ...latestMessage,
      messageId: 1,
      messageContent: 'Needle in an older message',
      sendTime: 1000,
    }
    const nextPage = {
      pageNo: 1,
      pageSize: 50,
      pageTotal: 1,
      totalCount: 2,
      list: [olderMatch, { ...latestMessage, messageId: 2, messageContent: 'Another old message', sendTime: 2000 }],
    }
    vi.mocked(chatApi.loadHistory).mockClear()
    vi.mocked(chatApi.loadHistory)
      .mockResolvedValueOnce({
        pageNo: 1,
        pageSize: 50,
        pageTotal: 2,
        totalCount: 4,
        list: [
          { ...latestMessage, messageId: 3, messageContent: 'Recent message', sendTime: 3000 },
          latestMessage,
        ],
      })
      .mockResolvedValueOnce(nextPage)

    await wrapper.get('[data-testid="toggle-message-search"]').trigger('click')
    await wrapper.get('[data-testid="message-search-input"]').setValue('needle')
    await wrapper.get('[data-testid="search-entire-history"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="search-history-status"]').text()).toContain('已搜索完整个会话历史')
    expect(wrapper.get('[data-testid="message-search-result-1"]').text()).toContain('Needle in an older message')
    const searchCalls = vi.mocked(chatApi.loadHistory).mock.calls
    expect(searchCalls).toHaveLength(2)
    expect(searchCalls[0]?.slice(0, 3)).toEqual(['U200', null, 50])
    expect(searchCalls[0]?.[3]).toBeInstanceOf(AbortSignal)
    expect(searchCalls[1]?.slice(0, 3)).toEqual(['U200', 3, 50])

    await wrapper.get('[data-testid="message-search-result-1"]').trigger('click')
    await flushPromises()
    expect(chatStore.initialMessages.some((message) => message.messageId === 1)).toBe(true)
    expect(wrapper.find('[data-testid="message-1"]').exists()).toBe(true)
  })

  it('can cancel a full-history search without processing its late response', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    let resolveSearchPage!: (page: Awaited<ReturnType<typeof chatApi.loadHistory>>) => void
    vi.mocked(chatApi.loadHistory).mockClear().mockImplementation(
      () => new Promise((resolve) => { resolveSearchPage = resolve }),
    )
    await wrapper.get('[data-testid="toggle-message-search"]').trigger('click')
    await wrapper.get('[data-testid="message-search-input"]').setValue('needle')
    await wrapper.get('[data-testid="search-entire-history"]').trigger('click')
    expect(wrapper.find('[data-testid="cancel-history-search"]').exists()).toBe(true)
    await wrapper.get('[data-testid="cancel-history-search"]').trigger('click')
    resolveSearchPage({ pageNo: 1, pageSize: 50, pageTotal: 2, totalCount: 100, list: [] })
    await flushPromises()

    expect(chatApi.loadHistory).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="cancel-history-search"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="search-entire-history"]').text()).toBe('继续搜索全部历史')
  })

  it('moves keyboard focus into message search and restores it after Escape', async () => {
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    const toggle = wrapper.get('[data-testid="toggle-message-search"]')
    await toggle.trigger('click')
    await flushPromises()
    const input = wrapper.get('[data-testid="message-search-input"]')
    expect(document.activeElement).toBe(input.element)

    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.find('[data-testid="message-search-panel"]').exists()).toBe(false)
    expect(document.activeElement).toBe(toggle.element)
  })

  it('traps profile dialog focus and restores the profile trigger after closing', async () => {
    const { wrapper } = await mountChat()
    document.body.appendChild(wrapper.element)

    const trigger = wrapper.get('[data-testid="profile-menu-trigger"]')
    await trigger.trigger('click')
    await wrapper.get('[data-testid="open-profile"]').trigger('click')
    await flushPromises()
    const dialog = wrapper.get('.profile-dialog')
    expect(document.activeElement).toBe(wrapper.get('.profile-close').element)
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

    await dialog.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.profile-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('shows device labels and marks the current browser session', async () => {
    vi.mocked(authApi.listSessions).mockResolvedValue([
      { sessionId: 'session-current', deviceName: 'Chrome · Windows', deviceType: 'browser', createdAt: 100, lastActiveAt: 300, current: true },
      { sessionId: 'session-phone', deviceName: 'WeTalkApp · Windows', deviceType: 'desktop', createdAt: 90, lastActiveAt: 150, current: false },
    ])
    const { wrapper } = await mountChat()

    await openProfileDialog(wrapper)
    await flushPromises()

    expect(authApi.listSessions).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="session-policy-note"]').text()).toContain('一台 WeTalk 客户端和一个浏览器')
    expect(wrapper.get('[data-testid="session-row-session-current"]').text()).toContain('Chrome · Windows')
    expect(wrapper.get('[data-testid="session-row-session-current"]').text()).toContain('浏览器会话')
    expect(wrapper.get('[data-testid="session-row-session-current"]').text()).toContain('当前设备')
    expect(wrapper.get('[data-testid="session-row-session-phone"]').text()).toContain('WeTalkApp · Windows')
    expect(wrapper.get('[data-testid="session-row-session-phone"]').text()).toContain('电脑客户端会话')
    expect(wrapper.find('[data-testid="revoke-session-session-current"]').exists()).toBe(false)
  })

  it('revokes one other session and keeps the current browser signed in', async () => {
    vi.mocked(authApi.listSessions).mockResolvedValue([
      { sessionId: 'session-current', deviceName: 'Chrome · Windows', createdAt: 100, lastActiveAt: 300, current: true },
      { sessionId: 'session-phone', deviceName: 'Safari · iOS', createdAt: 90, lastActiveAt: 150, current: false },
    ])
    const { wrapper, authStore } = await mountChat()

    await openProfileDialog(wrapper)
    await flushPromises()
    await wrapper.get('[data-testid="revoke-session-session-phone"]').trigger('click')
    await wrapper.get('[data-testid="confirm-revoke-session-session-phone"]').trigger('click')
    await flushPromises()

    expect(authApi.revokeSession).toHaveBeenCalledWith('session-phone')
    expect(wrapper.find('[data-testid="session-row-session-phone"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="session-row-session-current"]').exists()).toBe(true)
    expect(authStore.session?.userId).toBe('U100')
    expect(wrapper.get('[data-testid="session-management"]').text()).toContain('已退出“Safari · iOS”')
  })

  it('revokes all other sessions but preserves the current browser session', async () => {
    vi.mocked(authApi.listSessions).mockResolvedValue([
      { sessionId: 'session-current', deviceName: 'Chrome · Windows', createdAt: 100, lastActiveAt: 300, current: true },
      { sessionId: 'session-phone', deviceName: 'Safari · iOS', createdAt: 90, lastActiveAt: 150, current: false },
      { sessionId: 'session-tablet', deviceName: 'Chrome · Android', createdAt: 80, lastActiveAt: 140, current: false },
    ])
    vi.mocked(authApi.revokeOtherSessions).mockResolvedValue({ revokedCount: 2 })
    const { wrapper, authStore } = await mountChat()

    await openProfileDialog(wrapper)
    await flushPromises()
    await wrapper.get('[data-testid="revoke-other-sessions"]').trigger('click')
    await wrapper.get('[data-testid="confirm-revoke-other-sessions"]').trigger('click')
    await flushPromises()

    expect(authApi.revokeOtherSessions).toHaveBeenCalledOnce()
    expect(wrapper.find('[data-testid="session-row-session-phone"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="session-row-session-tablet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="session-row-session-current"]').exists()).toBe(true)
    expect(authStore.session?.userId).toBe('U100')
    expect(wrapper.get('[data-testid="session-management"]').text()).toContain('已退出 2 台其他设备')
  })

  it('keeps the mobile chat shell aligned with the visible viewport when the keyboard moves it', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    const viewport = new EventTarget() as unknown as VisualViewport
    Object.defineProperty(viewport, 'height', { configurable: true, value: 540 })
    Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 0 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { wrapper } = await mountChat()
    try {
      const shell = wrapper.get('[data-testid="chat-shell"]')
      expect((shell.element as HTMLElement).style.getPropertyValue('--wt-chat-visual-viewport-height')).toBe('540px')
      expect((shell.element as HTMLElement).style.getPropertyValue('--wt-chat-visual-viewport-top')).toBe('0px')
      expect(document.documentElement.classList.contains('wt-chat-viewport-lock')).toBe(true)
      expect(document.documentElement.style.getPropertyValue('--wt-chat-viewport-bottom')).toBe('540px')

      Object.defineProperty(viewport, 'height', { configurable: true, value: 240 })
      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 96 })
      viewport.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect((shell.element as HTMLElement).style.getPropertyValue('--wt-chat-visual-viewport-height')).toBe('240px')
      expect((shell.element as HTMLElement).style.getPropertyValue('--wt-chat-visual-viewport-top')).toBe('96px')
      expect(document.documentElement.style.getPropertyValue('--wt-chat-viewport-bottom')).toBe('336px')

      Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: 120 })
      viewport.dispatchEvent(new Event('scroll'))
      await flushPromises()
      expect((shell.element as HTMLElement).style.getPropertyValue('--wt-chat-visual-viewport-top')).toBe('120px')
      expect(document.documentElement.style.getPropertyValue('--wt-chat-viewport-bottom')).toBe('360px')
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth)
      else Reflect.deleteProperty(window, 'innerWidth')
      if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport)
      else Reflect.deleteProperty(window, 'visualViewport')
    }
    expect(document.documentElement.classList.contains('wt-chat-viewport-lock')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--wt-chat-viewport-bottom')).toBe('')
  })

  it('keeps mobile navigation open so closing the profile dialog restores visible focus', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { wrapper } = await mountChat()
    document.body.appendChild(wrapper.element)
    try {
      const navigationToggle = wrapper.get('[aria-label="打开导航菜单"]')
      await navigationToggle.trigger('click')
      await flushPromises()
      const opener = wrapper.get('[data-testid="profile-menu-trigger"]')
      ;(opener.element as HTMLElement).focus()
      await opener.trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="open-profile"]').trigger('click')
      await flushPromises()

      await wrapper.get('.profile-dialog').trigger('keydown', { key: 'Escape' })
      await flushPromises()

      expect(navigationToggle.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(opener.element)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth)
      else Reflect.deleteProperty(window, 'innerWidth')
    }
  })

  it('keeps mobile navigation open so closing contact search restores visible focus', async () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    try {
      chatStore.receiveMessage({
        messageType: 0,
        extentData: {
          chatSessionList: [{
            sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
            lastMessage: '', lastReceiveTime: 1000, contactType: 0,
          }],
          chatMessageList: [],
          applyCount: 0,
        },
      })
      await flushPromises()
      const navigationToggle = wrapper.get('[aria-label="打开导航菜单"]')
      await navigationToggle.trigger('click')
      await flushPromises()
      const opener = wrapper.get('[data-testid="open-contact-search"]')
      ;(opener.element as HTMLElement).focus()
      await opener.trigger('click')
      await flushPromises()

      await wrapper.get('.contact-dialog').trigger('keydown', { key: 'Escape' })
      await flushPromises()

      expect(navigationToggle.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(opener.element)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
      if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth)
      else Reflect.deleteProperty(window, 'innerWidth')
    }
  })

  it('sends a selected-session text message and adds the saved message to the view', async () => {
    const sentMessage = {
      messageId: 101,
      sessionId: 'S200',
      messageType: 2,
      messageContent: 'Hello from the web',
      sendUserId: 'U100',
      sendUserNickName: 'Old Name',
      sendTime: 2000,
      contactId: 'U200',
    }
    let resolveSend!: (message: typeof sentMessage) => void
    vi.mocked(chatApi.sendTextMessage).mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve }),
    )
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="message-composer"]').attributes('rows')).toBe('1')
    await wrapper.get('[data-testid="message-composer"]').setValue('Hello from the web')
    expect((wrapper.get('[data-testid="message-composer"]').element as HTMLTextAreaElement).style.height).toBe('30px')
    expect(wrapper.get('[data-testid="send-message"]').element).toHaveProperty('disabled', false)
    await wrapper.get('[data-testid="send-message"]').trigger('click')
    expect(wrapper.get('[data-testid="send-message"]').attributes('aria-label')).toBe('正在发送')
    expect(wrapper.get('[data-testid="send-message"]').element).toHaveProperty('disabled', true)
    expect(wrapper.find('[data-testid="message-101"]').exists()).toBe(false)

    resolveSend(sentMessage)
    await flushPromises()

    expect(chatApi.sendTextMessage).toHaveBeenCalledWith(
      'U200',
      'Hello from the web',
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    )
    expect(chatStore.initialMessages).toContainEqual(sentMessage)
    expect(wrapper.get('[data-testid="message-101"]').text()).toContain('Hello from the web')
    expect(wrapper.get('[data-testid="message-send-status"]').text()).toBe('已发送')
    expect(wrapper.get('[data-testid="message-send-status"]').attributes('aria-label')).toBe('服务端已接收并保存')
    chatStore.receiveMessage({
      messageType: 17,
      sessionId: 'S200',
      contactId: 'U200',
      sendUserId: 'U200',
      messageId: 101,
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="message-send-status"]').text()).toBe('已读')
    expect(wrapper.get('[data-testid="message-send-status"]').attributes('aria-label')).toBe('已读')
    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-testid="message-composer"]').attributes('aria-label')).toBe('消息内容')
  })

  it('selects and uploads a normal file, then displays its completed status', async () => {
    vi.mocked(chatApi.uploadFile).mockImplementation(async (_messageId, _file, onProgress) => {
      onProgress?.(50)
      return '上传成功'
    })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    const input = wrapper.get('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change')
    await flushPromises()

    expect(chatApi.sendFileMessage).toHaveBeenCalledWith('U200', file, 2)
    expect(chatApi.uploadFile).toHaveBeenCalledWith(601, file, expect.any(Function))
    expect(wrapper.get('[data-testid="file-attachment"]').text()).toContain('notes.txt')
    expect(wrapper.get('.file-message-status').text()).toContain('已上传 · 5 B')
    expect(chatStore.initialMessages[0]?.status).toBe(1)
    wrapper.unmount()
  })

  it('generates and uploads a PNG cover for a video, then requests its preview thumbnail', async () => {
    const video = new File(['video bytes'], 'clip.mp4', { type: 'video/mp4' })
    const cover = new File(['png cover'], 'clip-cover.png', { type: 'image/png' })
    vi.mocked(createVideoCover).mockResolvedValue(cover)
    vi.mocked(chatApi.sendFileMessage).mockResolvedValue({
      messageId: 606,
      sessionId: 'S200',
      messageType: 5,
      messageContent: '[媒体]',
      sendUserId: 'U100',
      sendUserNickName: 'Old Name',
      sendTime: 2000,
      contactId: 'U200',
      fileName: video.name,
      fileSize: video.size,
      fileType: 1,
      status: 0,
    })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    const input = wrapper.get('[data-testid="file-input"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [video] })
    await input.trigger('change')
    await flushPromises()

    expect(createVideoCover).toHaveBeenCalledWith(video, 200 * 1024 * 1024)
    expect(chatApi.uploadFile).toHaveBeenCalledWith(606, video, expect.any(Function), cover)
    expect(chatApi.downloadFile).toHaveBeenCalledWith(606, true)
    expect(wrapper.find('[data-testid="media-thumbnail-606"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('accepts a normal file dropped into the chat panel', async () => {
    vi.mocked(chatApi.sendFileMessage).mockResolvedValue({
      messageId: 603,
      sessionId: 'S200',
      messageType: 5,
      messageContent: '[文件]',
      sendUserId: 'U100',
      sendUserNickName: 'Old Name',
      sendTime: 2000,
      contactId: 'U200',
      fileName: 'dropped.txt',
      fileSize: 9,
      fileType: 2,
      status: 0,
    })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    const file = new File(['drop file'], 'dropped.txt', { type: 'text/plain' })
    const transfer = { types: ['Files'], files: [file], dropEffect: 'none' }
    const dragEnter = new Event('dragenter', { bubbles: true, cancelable: true })
    Object.defineProperty(dragEnter, 'dataTransfer', { value: transfer })
    wrapper.get('[data-testid="chat-main"]').element.dispatchEvent(dragEnter)
    await flushPromises()
    expect(wrapper.find('[data-testid="file-drop-overlay"]').exists()).toBe(true)

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', { value: transfer })
    wrapper.get('[data-testid="chat-main"]').element.dispatchEvent(drop)
    await flushPromises()

    expect(wrapper.find('[data-testid="file-drop-overlay"]').exists()).toBe(false)
    expect(chatApi.sendFileMessage).toHaveBeenCalledWith('U200', file, 2)
    expect(wrapper.get('[data-testid="file-attachment"]').text()).toContain('dropped.txt')
    wrapper.unmount()
  })

  it('downloads an uploaded file using its original filename', async () => {
    const blob = new Blob(['file bytes'], { type: 'application/octet-stream' })
    vi.mocked(chatApi.downloadFile).mockImplementation(async (fileId) =>
      fileId === 602 ? blob : new Blob(['avatar bytes'], { type: 'image/png' }),
    )
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:wetalk-test')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    let downloadedName = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedName = this.download
    })

    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'notes.txt',
          lastReceiveTime: 2000,
          contactType: 0,
        }],
        chatMessageList: [{
          messageId: 602,
          sessionId: 'S200',
          messageType: 5,
          messageContent: '[文件]',
          sendUserId: 'U200',
          sendUserNickName: 'Friend',
          sendTime: 2000,
          contactId: 'U100',
          fileName: 'notes.txt',
          fileSize: 10,
          fileType: 2,
          status: 1,
        }],
        applyCount: 0,
      },
    })
    await flushPromises()
    vi.useFakeTimers()
    try {
      await wrapper.get('[data-testid="download-file"]').trigger('click')
      await flushPromises()

      expect(chatApi.downloadFile).toHaveBeenCalledWith(602)
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(downloadedName).toBe('notes.txt')

      const saveToSelectedDestination = vi.fn().mockResolvedValue(undefined)
      downloadPreferences.mode = 'ask'
      downloadPreferences.prepareDestination.mockResolvedValue(saveToSelectedDestination)
      await wrapper.get('[data-testid="download-file"]').trigger('click')
      await flushPromises()
      expect(downloadPreferences.prepareDestination).toHaveBeenCalledWith('notes.txt')
      expect(saveToSelectedDestination).toHaveBeenCalledWith(blob)
      expect(createObjectURL.mock.calls.filter(([value]) => value === blob)).toHaveLength(1)

      vi.runOnlyPendingTimers()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:wetalk-test')
    } finally {
      vi.useRealTimers()
      click.mockRestore()
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
      wrapper.unmount()
    }
  })

  it('previews an uploaded image in the in-app viewer and revokes its Blob URL', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' })
    vi.mocked(chatApi.downloadFile).mockResolvedValue(blob)
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn(() => 'blob:image-preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'photo.png',
          lastReceiveTime: 2000,
          contactType: 0,
        }],
        chatMessageList: [{
          messageId: 604,
          sessionId: 'S200',
          messageType: 5,
          messageContent: '[文件]',
          sendUserId: 'U200',
          sendUserNickName: 'Friend',
          sendTime: 2000,
          contactId: 'U100',
          fileName: 'photo.png',
          fileSize: 11,
          fileType: 0,
          status: 1,
        }],
        applyCount: 0,
      },
    })
    await flushPromises()
    try {
      const previewButton = wrapper.get('[data-testid="preview-media"]').element
      await wrapper.get('[data-testid="preview-media"]').trigger('click')
      await flushPromises()

      expect(chatApi.downloadFile).toHaveBeenCalledWith(604)
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(wrapper.get('[data-testid="media-preview-overlay"] img').attributes('src')).toBe('blob:image-preview')
      expect(wrapper.get('[data-testid="media-preview-overlay"] img').attributes('alt')).toBe('photo.png')
      const dialog = wrapper.get('[data-testid="media-preview-dialog"]')
      const closeButton = wrapper.get('[aria-label="关闭媒体预览"]')
      expect(document.activeElement).toBe(closeButton.element)

      await dialog.trigger('keydown', { key: 'Tab' })
      expect(document.activeElement).toBe(closeButton.element)
      await dialog.trigger('keydown', { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(closeButton.element)
      await dialog.trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(wrapper.find('[data-testid="media-preview-overlay"]').exists()).toBe(false)
      expect(document.activeElement).toBe(previewButton)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-preview')
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('opens an uploaded video in the media preview player', async () => {
    vi.mocked(chatApi.streamMediaUrl).mockReturnValue('/api/chat/streamMedia?fileId=605')
    vi.mocked(chatApi.downloadFile).mockResolvedValue(new Blob(['video bytes'], { type: 'application/octet-stream' }))
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:video-preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'clip.mp4',
          lastReceiveTime: 2000,
          contactType: 0,
        }],
        chatMessageList: [{
          messageId: 605,
          sessionId: 'S200',
          messageType: 5,
          messageContent: '[媒体]',
          sendUserId: 'U200',
          sendUserNickName: 'Friend',
          sendTime: 2000,
          contactId: 'U100',
          fileName: 'clip.mp4',
          fileSize: 10,
          fileType: 1,
          status: 1,
        }],
        applyCount: 0,
      },
    })
    await flushPromises()
    try {
      await wrapper.get('[data-testid="preview-media"]').trigger('click')
      await flushPromises()

      expect(chatApi.streamMediaUrl).toHaveBeenCalledWith(605)
      expect(chatApi.downloadFile).not.toHaveBeenCalledWith(605)
      expect(wrapper.find('[data-testid="media-preview-overlay"] video').exists()).toBe(true)
      expect(wrapper.get('[data-testid="media-preview-overlay"] video').attributes('src')).toBe('/api/chat/streamMedia?fileId=605')

      await wrapper.get('[aria-label="关闭媒体预览"]').trigger('click')
    } finally {
      wrapper.unmount()
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('falls back to an authenticated Blob when the media stream cannot use the same origin', async () => {
    vi.mocked(chatApi.streamMediaUrl).mockReturnValue(null)
    vi.mocked(chatApi.downloadFile).mockResolvedValue(new Blob(['video bytes'], { type: 'application/octet-stream' }))
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:video-preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'clip.mp4',
          lastReceiveTime: 2000,
          contactType: 0,
        }],
        chatMessageList: [{
          messageId: 605,
          sessionId: 'S200',
          messageType: 5,
          messageContent: '[媒体]',
          sendUserId: 'U200',
          sendUserNickName: 'Friend',
          sendTime: 2000,
          contactId: 'U100',
          fileName: 'clip.mp4',
          fileSize: 10,
          fileType: 1,
          status: 1,
        }],
        applyCount: 0,
      },
    })
    await flushPromises()
    try {
      await wrapper.get('[data-testid="preview-media"]').trigger('click')
      await flushPromises()

      expect(chatApi.downloadFile).toHaveBeenCalledWith(605)
      expect(wrapper.find('[data-testid="media-preview-overlay"] video').exists()).toBe(true)
      expect(createObjectURL.mock.calls.map(([blob]) => blob.type)).toContain('video/mp4')

      await wrapper.get('[aria-label="关闭媒体预览"]').trigger('click')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-preview')
    } finally {
      wrapper.unmount()
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('keeps the draft and allows retry when sending a message fails', async () => {
    vi.mocked(chatApi.sendTextMessage)
      .mockRejectedValueOnce(new Error('网络暂时不可用'))
      .mockResolvedValueOnce({
        messageId: 44,
        sessionId: 'S200',
        messageType: 2,
        messageContent: 'Please retry this',
        sendUserId: 'U100',
        sendUserNickName: 'Student',
        sendTime: 3000,
        contactId: 'U200',
      })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()
    await wrapper.get('[data-testid="message-composer"]').setValue('Please retry this')
    await wrapper.get('[data-testid="send-message"]').trigger('click')
    await flushPromises()
    const clientMessageId = vi.mocked(chatApi.sendTextMessage).mock.calls[0]?.[2]

    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', 'Please retry this')
    expect(wrapper.get('.composer-error').text()).toBe('网络暂时不可用')
    expect(wrapper.get('[data-testid="send-message"]').element).toHaveProperty('disabled', false)
    expect(wrapper.find('[data-testid="message-send-status"]').exists()).toBe(false)

    await wrapper.get('[data-testid="retry-message-send"]').trigger('click')
    await flushPromises()
    expect(chatApi.sendTextMessage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chatApi.sendTextMessage).mock.calls[1]?.[2]).toBe(clientMessageId)
    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', '')
    expect(wrapper.find('[data-testid="retry-message-send"]').exists()).toBe(false)
  })

  it('persists the latest visible message as read when a conversation opens', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: 'Read cursor target', lastReceiveTime: 1000, contactType: 0, noReadCount: 2,
        }],
        chatMessageList: [{
          messageId: 90, sessionId: 'S200', messageType: 2, messageContent: 'Read cursor target',
          sendUserId: 'U200', sendUserNickName: 'Friend', sendTime: 1000, contactId: 'U100',
        }],
        applyCount: 0,
      },
    })
    await flushPromises()

    expect(chatApi.markRead).toHaveBeenCalledWith('U200', 90)
    expect(wrapper.find('[data-testid="chat-session-S200"] [aria-label="2 条未读消息"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('persists an offline text message and replays it once the browser reconnects', async () => {
    let queuedMessages: Array<{
      clientMessageId: string
      sessionId: string
      contactId: string
      messageContent: string
      createdAt: number
    }> = []
    const savePending = vi.spyOn(textMessageCache, 'savePendingTextMessage').mockImplementation(async (_accountId, message) => {
      queuedMessages = [...queuedMessages.filter((item) => item.clientMessageId !== message.clientMessageId), message]
      return true
    })
    vi.spyOn(textMessageCache, 'getPendingTextMessages').mockImplementation(async () => queuedMessages)
    const deletePending = vi.spyOn(textMessageCache, 'deletePendingTextMessage').mockImplementation(async (_accountId, clientMessageId) => {
      queuedMessages = queuedMessages.filter((item) => item.clientMessageId !== clientMessageId)
    })
    const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const message = {
      messageId: 75,
      sessionId: 'S200',
      messageType: 2,
      messageContent: 'Queued while offline',
      sendUserId: 'U100',
      sendUserNickName: 'Student',
      sendTime: 5000,
      contactId: 'U200',
    }
    vi.mocked(chatApi.sendTextMessage).mockResolvedValue(message)
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    try {
      await wrapper.get('[data-testid="message-composer"]').setValue('Queued while offline')
      await wrapper.get('[data-testid="send-message"]').trigger('click')
      await flushPromises()

      expect(savePending).toHaveBeenCalledOnce()
      expect(chatApi.sendTextMessage).not.toHaveBeenCalled()
      expect(queuedMessages).toHaveLength(1)
      const queuedClientMessageId = queuedMessages[0]!.clientMessageId
      expect(wrapper.find('[data-testid="pending-text-queue"]').text()).toContain('Queued while offline')
      expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', '')

      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
      window.dispatchEvent(new Event('online'))
      await flushPromises()

      expect(chatApi.sendTextMessage).toHaveBeenCalledWith('U200', 'Queued while offline', queuedClientMessageId)
      expect(deletePending).toHaveBeenCalledWith('U100', queuedClientMessageId)
      expect(wrapper.find('[data-testid="pending-text-queue"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="message-75"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      savePending.mockRestore()
      vi.mocked(textMessageCache.getPendingTextMessages).mockRestore()
      deletePending.mockRestore()
      if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor)
      else Reflect.deleteProperty(navigator, 'onLine')
    }
  })

  it('restores and automatically replays persisted text after reopening the chat page', async () => {
    const pending = {
      clientMessageId: 'b1b2c3d4-1234-4abc-8def-1234567890ab',
      sessionId: 'S200',
      contactId: 'U200',
      messageContent: 'Restore after reload',
      createdAt: 1000,
    }
    let queuedMessages = [pending]
    vi.spyOn(textMessageCache, 'getPendingTextMessages').mockImplementation(async () => queuedMessages)
    const deletePending = vi.spyOn(textMessageCache, 'deletePendingTextMessage').mockImplementation(async (_accountId, clientMessageId) => {
      queuedMessages = queuedMessages.filter((item) => item.clientMessageId !== clientMessageId)
    })
    vi.mocked(chatApi.sendTextMessage).mockResolvedValue({
      messageId: 76,
      sessionId: 'S200',
      messageType: 2,
      messageContent: pending.messageContent,
      sendUserId: 'U100',
      sendUserNickName: 'Student',
      sendTime: 6000,
      contactId: 'U200',
    })
    const { wrapper } = await mountChat()

    try {
      await flushPromises()

      expect(chatApi.sendTextMessage).toHaveBeenCalledWith('U200', pending.messageContent, pending.clientMessageId)
      expect(deletePending).toHaveBeenCalledWith('U100', pending.clientMessageId)
      expect(wrapper.find('[data-testid="pending-text-queue"]').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      vi.mocked(textMessageCache.getPendingTextMessages).mockRestore()
      deletePending.mockRestore()
    }
  })

  it('loads older messages with a cursor and preserves chronological order', async () => {
    const message = (messageId: number) => ({
      messageId,
      sessionId: 'S200',
      messageType: 2,
      messageContent: `Message ${messageId}`,
      sendUserId: 'U200',
      sendUserNickName: 'Friend',
      sendTime: messageId * 1000,
      contactId: 'U100',
    })
    vi.mocked(chatApi.loadHistory)
      .mockResolvedValueOnce({ pageNo: 1, pageSize: 2, pageTotal: 2, totalCount: 3, list: [message(2), message(3)] })
      .mockResolvedValueOnce({ pageNo: 1, pageSize: 2, pageTotal: 1, totalCount: 1, list: [message(1)] })
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: 'Message 3',
          lastReceiveTime: 3000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    expect(chatApi.loadHistory).toHaveBeenCalledWith('U200')
    expect(wrapper.find('[data-testid="message-2"]').exists()).toBe(true)
    await wrapper.get('[data-testid="load-older-messages"]').trigger('click')
    await flushPromises()

    expect(chatApi.loadHistory).toHaveBeenLastCalledWith('U200', 2)
    expect(chatStore.initialMessages.map((item) => item.messageId)).toEqual([1, 2, 3])
    expect(wrapper.text()).toContain('Message 1')
  })

  it('rejects mismatched passwords before calling the backend', async () => {
    const { wrapper } = await mountChat()
    await openProfileDialog(wrapper)
    await wrapper.get('[data-testid="new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="confirm-new-password"]').setValue('Different123')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')

    expect(authApi.updatePassword).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="password-error"]').text()).toBe('两次输入的密码不一致')
  })

  it('clears the session after a password change and asks the user to log in again', async () => {
    const { wrapper, router, authStore } = await mountChat()
    await openProfileDialog(wrapper)
    await wrapper.get('[data-testid="new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="confirm-new-password"]').setValue('NewPassword123')
    await wrapper.get('[data-testid="password-form"]').trigger('submit')
    await flushPromises()

    expect(authApi.updatePassword).toHaveBeenCalledWith('NewPassword123')
    expect(authStore.session).toBeNull()
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.passwordUpdated).toBe('1')
  })

  it('saves personal fields and JPEG avatar/cover, then refreshes the visible profile', async () => {
    const avatarFile = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' })
    const coverFile = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })
    vi.mocked(authApi.saveUserInfo).mockResolvedValue({
      userId: 'U100',
      email: 'student@example.com',
      nickName: 'New Student',
      admin: false,
      sex: 1,
      personalSignature: 'Hello from Web',
      areaName: 'Suzhou',
      areaCode: '320500',
      joinType: 0,
    })
    const { wrapper, authStore } = await mountChat()
    await openProfileDialog(wrapper)
    await flushPromises()
    await wrapper.get('[data-testid="edit-profile"]').trigger('click')
    await wrapper.get('[data-testid="profile-edit-name"]').setValue('New Student')
    await wrapper.get('[data-testid="profile-edit-sex"]').setValue('1')
    await wrapper.get('[data-testid="profile-edit-join-type"]').setValue('0')
    await wrapper.get('[data-testid="profile-edit-signature"]').setValue('Hello from Web')
    await wrapper.get('[data-testid="profile-edit-area-name"]').setValue('Suzhou')
    await wrapper.get('[data-testid="profile-edit-area-code"]').setValue('320500')

    const avatarInput = wrapper.get('[data-testid="profile-avatar-file"]').element as HTMLInputElement
    Object.defineProperty(avatarInput, 'files', { configurable: true, value: [avatarFile] })
    await wrapper.get('[data-testid="profile-avatar-file"]').trigger('change')
    const coverInput = wrapper.get('[data-testid="profile-cover-file"]').element as HTMLInputElement
    Object.defineProperty(coverInput, 'files', { configurable: true, value: [coverFile] })
    await wrapper.get('[data-testid="profile-cover-file"]').trigger('change')

    await wrapper.get('[data-testid="profile-edit-form"]').trigger('submit')
    await flushPromises()

    expect(authApi.saveUserInfo).toHaveBeenCalledWith({
      nickName: 'New Student',
      sex: 1,
      personalSignature: 'Hello from Web',
      areaName: 'Suzhou',
      areaCode: '320500',
      joinType: 0,
      avatarFile,
      coverFile,
    })
    expect(authStore.session?.nickName).toBe('New Student')
    expect(wrapper.text()).toContain('资料已保存')
    expect(wrapper.text()).toContain('Hello from Web')
    expect(wrapper.text()).toContain('允许直接添加')
  })

  it('opens and closes the add-friend dialog from the chat sidebar', async () => {
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-contact-search"]').trigger('click')

    expect(wrapper.find('[data-testid="contact-search-overlay"]').exists()).toBe(true)
    await wrapper.get('[aria-label="关闭联系人搜索"]').trigger('click')
    expect(wrapper.find('[data-testid="contact-search-overlay"]').exists()).toBe(false)
  })

  it('announces whether the mobile chat navigation is expanded', async () => {
    const { wrapper } = await mountChat()
    document.body.appendChild(wrapper.element)
    const trigger = wrapper.get('[aria-label="打开导航菜单"]')
    const navigation = wrapper.get('#chat-navigation')
    const focusable = Array.from(navigation.element.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    try {
      expect(trigger.attributes('aria-controls')).toBe('chat-navigation')
      expect(trigger.attributes('aria-expanded')).toBe('false')
      await trigger.trigger('click')
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(wrapper.get('[aria-label="关闭菜单"]').element)

      first.focus()
      await navigation.trigger('keydown', { key: 'Tab', shiftKey: true })
      expect(document.activeElement).toBe(last)
      await navigation.trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
    }
  })

  it('closes mobile navigation and focuses the composer after choosing a chat', async () => {
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    try {
      await wrapper.get('[aria-label="打开导航菜单"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="chat-session-S200"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[aria-label="打开导航菜单"]').attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(wrapper.get('[data-testid="message-composer"]').element)
    } finally {
      wrapper.unmount()
      wrapper.element.remove()
    }
  })

  it('opens the received-application inbox from the chat sidebar', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: { chatSessionList: [], chatMessageList: [], applyCount: 1 },
    })
    await flushPromises()
    await wrapper.get('[data-testid="open-contact-applications"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="contact-applications-overlay"]').exists()).toBe(true)
    expect(contactApi.loadApplications).toHaveBeenCalledWith(1)
  })

  it('places full-history search beside the sidebar collapse control', async () => {
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: 'A recent hello', lastReceiveTime: 2000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    const search = wrapper.get('[data-testid="toggle-message-search"]')
    const collapse = wrapper.get('[data-testid="collapse-sidebar"]')
    expect(search.element.parentElement).toBe(collapse.element.parentElement)
    expect(search.element.compareDocumentPosition(collapse.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(wrapper.find('.chat-main [data-testid="toggle-message-search"]').exists()).toBe(false)

    await search.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="message-search-panel"]').exists()).toBe(true)
  })

  it('closes the mobile drawer before searching and restores focus to its opener', async () => {
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    const innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: 'Hello', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    await flushPromises()

    try {
      const menuTrigger = wrapper.get('[aria-label="打开导航菜单"]')
      await menuTrigger.trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="toggle-message-search"]').trigger('click')
      await flushPromises()

      const input = wrapper.get('[data-testid="message-search-input"]')
      expect(menuTrigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(input.element)
      await input.trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(document.activeElement).toBe(menuTrigger.element)
    } finally {
      if (innerWidth) Object.defineProperty(window, 'innerWidth', innerWidth)
      wrapper.unmount()
      wrapper.element.remove()
    }
  })

  it('collapses the desktop sidebar and returns focus when it is expanded', async () => {
    const { wrapper, chatStore } = await mountChat()
    document.body.appendChild(wrapper.element)
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S200', contactId: 'U200', contactName: 'Friend',
          lastMessage: 'Hello', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 1,
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="collapse-sidebar"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-shell"]').classes()).toContain('is-sidebar-collapsed')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="expand-sidebar"]').element)
    expect(wrapper.find('[data-testid="toggle-message-search"]').exists()).toBe(true)
    expect(wrapper.find('.chat-main [data-testid="toggle-message-search"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="open-contact-search"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="open-contact-directory"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="open-group-directory"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="chat-session-S200"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-menu-trigger"] .profile-avatar').exists()).toBe(true)

    await wrapper.get('[data-testid="expand-sidebar"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="chat-shell"]').classes()).not.toContain('is-sidebar-collapsed')
    expect(document.activeElement).toBe(wrapper.get('[data-testid="collapse-sidebar"]').element)
    wrapper.unmount()
    wrapper.element.remove()
  })

  it('includes the pending application count in the screen-reader name', async () => {
    const { wrapper, chatStore } = await mountChat()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: { chatSessionList: [], chatMessageList: [], applyCount: 12 },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="open-contact-applications"]').attributes('aria-label'))
      .toBe('好友申请，12 条待处理')
  })

  it('opens the friend directory from the chat sidebar', async () => {
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-contact-directory"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="contact-directory-overlay"]').exists()).toBe(true)
    expect(contactApi.loadContacts).toHaveBeenCalledWith('USER')
  })

  it('opens the group directory from the chat sidebar', async () => {
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-group-directory"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="group-directory-overlay"]').exists()).toBe(true)
    expect(contactApi.loadContacts).toHaveBeenCalledWith('GROUP')
  })
})
