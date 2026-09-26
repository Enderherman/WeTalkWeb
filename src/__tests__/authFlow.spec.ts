import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatApi } from '@/api/chat'
import { authApi } from '@/api/auth'
import { contactApi } from '@/api/contacts'
import type { WebAuthSession } from '@/api/auth'
import App from '@/App.vue'
import { createRealtimeClient } from '@/api/realtime'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'
import AuthView from '@/views/AuthView.vue'
import ChatHome from '@/views/ChatHome.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { textMessageCache } from '@/storage/textMessageCache'

vi.mock('@/api/auth', () => ({
  authApi: {
    getCaptcha: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    createWebSocketTicket: vi.fn(),
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
    sendFileMessage: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    loadHistory: vi.fn(),
  },
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
  await flushPromises()
  return { wrapper, router, pinia, authStore, chatStore }
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

  it('clears only the signed-in account text cache from the profile panel', async () => {
    const clearCache = vi.spyOn(textMessageCache, 'clearAccount').mockResolvedValue(undefined)
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-profile"]').trigger('click')
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
    await wrapper.get('[data-testid="message-composer"]').setValue('Hello from the web')
    await wrapper.get('[data-testid="send-message"]').trigger('click')
    expect(wrapper.get('[data-testid="send-message"]').attributes('aria-label')).toBe('正在发送')
    expect(wrapper.get('[data-testid="send-message"]').element).toHaveProperty('disabled', true)
    expect(wrapper.find('[data-testid="message-101"]').exists()).toBe(false)

    resolveSend(sentMessage)
    await flushPromises()

    expect(chatApi.sendTextMessage).toHaveBeenCalledWith('U200', 'Hello from the web')
    expect(chatStore.initialMessages).toContainEqual(sentMessage)
    expect(wrapper.get('[data-testid="message-101"]').text()).toContain('Hello from the web')
    expect(wrapper.get('[data-testid="message-send-status"]').text()).toBe('已发送')
    expect(wrapper.get('[data-testid="message-send-status"]').attributes('aria-label')).toBe('服务端已接收并保存')
    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', '')
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
    vi.mocked(chatApi.downloadFile).mockResolvedValue(blob)
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectURL = vi.fn(() => 'blob:wetalk-test')
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
      await wrapper.get('[data-testid="preview-media"]').trigger('click')
      await flushPromises()

      expect(chatApi.downloadFile).toHaveBeenCalledWith(604)
      expect(createObjectURL).toHaveBeenCalledWith(blob)
      expect(wrapper.get('[data-testid="media-preview-overlay"] img').attributes('src')).toBe('blob:image-preview')
      expect(wrapper.get('[data-testid="media-preview-overlay"] img').attributes('alt')).toBe('photo.png')

      await wrapper.get('[aria-label="关闭媒体预览"]').trigger('click')
      expect(wrapper.find('[data-testid="media-preview-overlay"]').exists()).toBe(false)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:image-preview')
    } finally {
      wrapper.unmount()
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })

  it('opens an uploaded video in the media preview player', async () => {
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

  it('opens a video attachment in the media player with a browser video MIME type', async () => {
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

    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', 'Please retry this')
    expect(wrapper.get('.composer-error').text()).toBe('网络暂时不可用')
    expect(wrapper.get('[data-testid="send-message"]').element).toHaveProperty('disabled', false)
    expect(wrapper.find('[data-testid="message-send-status"]').exists()).toBe(false)

    await wrapper.get('[data-testid="retry-message-send"]').trigger('click')
    await flushPromises()
    expect(chatApi.sendTextMessage).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="message-composer"]').element).toHaveProperty('value', '')
    expect(wrapper.find('[data-testid="retry-message-send"]').exists()).toBe(false)
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
    })
    const { wrapper, authStore } = await mountChat()
    await wrapper.get('[data-testid="open-profile"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="edit-profile"]').trigger('click')
    await wrapper.get('[data-testid="profile-edit-name"]').setValue('New Student')
    await wrapper.get('[data-testid="profile-edit-sex"]').setValue('1')
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
      avatarFile,
      coverFile,
    })
    expect(authStore.session?.nickName).toBe('New Student')
    expect(wrapper.text()).toContain('资料已保存')
    expect(wrapper.text()).toContain('Hello from Web')
  })

  it('opens and closes the add-friend dialog from the chat sidebar', async () => {
    const { wrapper } = await mountChat()
    await wrapper.get('[data-testid="open-contact-search"]').trigger('click')

    expect(wrapper.find('[data-testid="contact-search-overlay"]').exists()).toBe(true)
    await wrapper.get('[aria-label="关闭联系人搜索"]').trigger('click')
    expect(wrapper.find('[data-testid="contact-search-overlay"]').exists()).toBe(false)
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
