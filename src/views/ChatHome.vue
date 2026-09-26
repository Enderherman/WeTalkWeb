<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authApi } from '@/api/auth'
import type { UserProfile } from '@/api/auth'
import { chatApi } from '@/api/chat'
import ContactApplicationsDialog from '@/components/ContactApplicationsDialog.vue'
import ContactDirectoryDialog from '@/components/ContactDirectoryDialog.vue'
import ContactSearchDialog from '@/components/ContactSearchDialog.vue'
import GroupDirectoryDialog from '@/components/GroupDirectoryDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore, type InitialChatMessage } from '@/stores/chat'
import { textMessageCache } from '@/storage/textMessageCache'
import { validateOrdinaryFile } from '@/utils/fileValidation'
import { validatePassword } from '@/utils/authValidation'
import { formatMessageTimeDivider, shouldShowMessageTime } from '@/utils/messageTime'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const sidebarOpen = ref(false)
const signingOut = ref(false)
const selectedSessionId = ref('')
const contactSearchOpen = ref(false)
const contactApplicationsOpen = ref(false)
const contactDirectoryOpen = ref(false)
const groupDirectoryOpen = ref(false)
const groupDirectoryRefreshKey = ref(0)
const profileOpen = ref(false)
const profileLoading = ref(false)
const profileError = ref('')
const profile = ref<UserProfile | null>(null)
const passwordForm = reactive({ password: '', confirmPassword: '' })
const passwordError = ref('')
const changingPassword = ref(false)
const clearingTextCache = ref(false)
const cacheNotice = ref('')

const displayName = computed(() => profile.value?.nickName || authStore.session?.nickName || 'WeTalk 用户')
const avatarInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())
const selectedSession = computed(
  () => chatStore.sessionList.find((session) => session.sessionId === selectedSessionId.value) || null,
)
const selectedMessages = computed(() =>
  chatStore.initialMessages
    .filter((message) => message.sessionId === selectedSessionId.value && [2, 3, 5, 8, 9, 11, 12].includes(message.messageType))
    .sort((a, b) => a.sendTime - b.sendTime)
    .slice(-80),
)
const currentHistory = computed(() => chatStore.historyBySession[selectedSessionId.value] || null)
const messageDraft = ref('')
const sendingMessage = ref(false)
const messageError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileUploadError = ref('')
const fileUploading = ref(false)
const pendingUploadFiles = reactive(new Map<number, File>())
const downloadingFiles = reactive(new Set<number>())
const fileDownloadErrors = reactive(new Map<number, string>())
const messagePanel = ref<HTMLElement | null>(null)
const historyLoading = ref(false)
const olderMessagesLoading = ref(false)
const historyError = ref('')
const preservingScroll = ref(false)
let historyRequestId = 0
const connectionLabel = computed(() => {
  switch (chatStore.connectionStatus) {
    case 'connected':
      return '实时已连接'
    case 'connecting':
      return '正在连接'
    case 'reconnecting':
      return '正在重连'
    case 'offline':
      return '连接中断'
    default:
      return '未连接'
  }
})

watch(
  () => chatStore.sessionList,
  (sessions) => {
    if (!sessions.some((session) => session.sessionId === selectedSessionId.value)) {
      selectedSessionId.value = sessions[0]?.sessionId || ''
    }
  },
  { immediate: true },
)

watch(selectedSessionId, (sessionId) => {
  void loadLatestHistory(sessionId)
})

watch(
  () => chatStore.groupEventVersion,
  (version, previousVersion) => {
    if (version !== previousVersion && groupDirectoryOpen.value) groupDirectoryRefreshKey.value += 1
  },
)

watch(selectedMessages, async () => {
  if (preservingScroll.value) return
  await nextTick()
  if (messagePanel.value) messagePanel.value.scrollTop = messagePanel.value.scrollHeight
})

onMounted(() => {
  void loadProfile()
  const session = authStore.session
  if (session?.token) chatStore.connect(session.token, session.userId)
})

onBeforeUnmount(() => {
  historyRequestId += 1
  chatStore.disconnect()
})

async function loadLatestHistory(sessionId: string) {
  const requestId = ++historyRequestId
  historyError.value = ''
  const session = chatStore.sessionList.find((item) => item.sessionId === sessionId)
  if (!sessionId || !session || chatStore.historyBySession[sessionId]?.loaded) return

  historyLoading.value = true
  try {
    const accountId = authStore.session?.userId
    if (accountId) {
      try {
        const cachedMessages = await textMessageCache.getLatestTextMessages(accountId, sessionId, 30)
        if (
          requestId === historyRequestId &&
          selectedSessionId.value === sessionId &&
          cachedMessages.length > 0
        ) {
          chatStore.mergeCachedMessages(sessionId, cachedMessages)
        }
      } catch {
        // IndexedDB is optional; continue with the authoritative server request.
      }
    }
    const page = await chatApi.loadHistory(session.contactId)
    if (requestId !== historyRequestId || selectedSessionId.value !== sessionId) return
    chatStore.setHistoryPage(sessionId, page)
  } catch (error: unknown) {
    if (requestId === historyRequestId) {
      historyError.value = error instanceof Error ? error.message : '历史消息暂时无法加载'
    }
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false
  }
}

async function loadOlderMessages() {
  const session = selectedSession.value
  const history = currentHistory.value
  if (!session || !history?.hasMore || history.beforeMessageId === null || olderMessagesLoading.value) return

  const sessionId = session.sessionId
  const beforeMessageId = history.beforeMessageId
  const previousHeight = messagePanel.value?.scrollHeight || 0
  olderMessagesLoading.value = true
  historyError.value = ''
  try {
    const page = await chatApi.loadHistory(session.contactId, beforeMessageId)
    if (selectedSessionId.value !== sessionId) return
    preservingScroll.value = true
    chatStore.setHistoryPage(sessionId, page, true)
    await nextTick()
    if (messagePanel.value) messagePanel.value.scrollTop += messagePanel.value.scrollHeight - previousHeight
  } catch (error: unknown) {
    historyError.value = error instanceof Error ? error.message : '更早的消息暂时无法加载'
  } finally {
    preservingScroll.value = false
    olderMessagesLoading.value = false
  }
}

async function loadProfile() {
  profileLoading.value = true
  profileError.value = ''
  try {
    profile.value = await authApi.getUserInfo()
    const session = authStore.session
    if (session) {
      authStore.setSession({
        ...session,
        email: profile.value.email || session.email,
        nickName: profile.value.nickName || session.nickName,
        admin: profile.value.admin,
      })
    }
  } catch (error: unknown) {
    profileError.value = error instanceof Error ? error.message : '个人资料暂时无法读取'
  } finally {
    profileLoading.value = false
  }
}

function openProfile() {
  profileOpen.value = true
  sidebarOpen.value = false
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  passwordError.value = ''
}

function openContactSearch() {
  sidebarOpen.value = false
  contactSearchOpen.value = true
}

function openContactApplications() {
  sidebarOpen.value = false
  contactApplicationsOpen.value = true
}

function openContactDirectory() {
  sidebarOpen.value = false
  contactDirectoryOpen.value = true
}

function openGroupDirectory() {
  sidebarOpen.value = false
  groupDirectoryOpen.value = true
}

function refreshChatSession() {
  const session = authStore.session
  if (session?.token) chatStore.connect(session.token, session.userId)
}

function closeProfile() {
  if (changingPassword.value) return
  profileOpen.value = false
}

async function clearLocalTextCache() {
  const accountId = authStore.session?.userId
  if (!accountId || clearingTextCache.value) return
  clearingTextCache.value = true
  cacheNotice.value = ''
  try {
    await textMessageCache.clearAccount(accountId)
    cacheNotice.value = '本机文字缓存已清除'
  } catch {
    cacheNotice.value = '缓存暂时无法清除，请稍后重试'
  } finally {
    clearingTextCache.value = false
  }
}

async function changePassword() {
  passwordError.value = validatePassword(passwordForm.password) || ''
  if (passwordError.value) return
  if (passwordForm.confirmPassword !== passwordForm.password) {
    passwordError.value = '两次输入的密码不一致'
    return
  }

  changingPassword.value = true
  try {
    await authApi.updatePassword(passwordForm.password)
    chatStore.clear()
    authStore.clearSession()
    await router.replace({ name: 'login', query: { passwordUpdated: '1' } })
  } catch (error: unknown) {
    passwordError.value = error instanceof Error ? error.message : '密码修改失败，请稍后重试'
  } finally {
    changingPassword.value = false
  }
}

async function sendTextMessage() {
  const content = messageDraft.value.trim()
  if (
    !selectedSession.value ||
    selectedSession.value.groupClosed ||
    selectedSession.value.groupAccessRevoked ||
    !content ||
    sendingMessage.value
  ) return

  sendingMessage.value = true
  messageError.value = ''
  try {
    const message = await chatApi.sendTextMessage(selectedSession.value.contactId, content)
    chatStore.appendMessage(message, true)
    messageDraft.value = ''
  } catch (error: unknown) {
    messageError.value = error instanceof Error ? error.message : '消息发送失败，请稍后重试'
  } finally {
    sendingMessage.value = false
  }
}

function chooseAttachment() {
  fileUploadError.value = ''
  fileInput.value?.click()
}

async function selectAttachment(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  input.value = ''
  if (!file) return
  fileUploadError.value = ''

  const session = selectedSession.value
  if (!session || session.groupClosed || session.groupAccessRevoked) {
    fileUploadError.value = '当前会话不可发送文件'
    return
  }
  const validationError = validateOrdinaryFile(file)
  if (validationError) {
    fileUploadError.value = validationError
    return
  }
  await sendFileAttachment(session.contactId, file)
}

async function sendFileAttachment(contactId: string, file: File) {
  if (fileUploading.value) return
  fileUploading.value = true
  fileUploadError.value = ''
  let message: InitialChatMessage | null = null
  try {
    message = await chatApi.sendFileMessage(contactId, file)
    chatStore.appendMessage(message, true)
    pendingUploadFiles.set(message.messageId, file)
    await uploadFileForMessage(message.messageId, file)
  } catch (error: unknown) {
    if (message) {
      chatStore.markFileUploadFailed(message.messageId, '上传失败，请重试')
    } else {
      fileUploadError.value = error instanceof Error ? error.message : '文件消息发送失败，请稍后重试'
    }
  } finally {
    fileUploading.value = false
  }
}

async function uploadFileForMessage(messageId: number, file: File) {
  await chatApi.uploadFile(messageId, file, (progress) => chatStore.setFileUploadProgress(messageId, progress))
  chatStore.markFileUploadComplete(messageId)
  pendingUploadFiles.delete(messageId)
}

async function retryFileUpload(messageId: number) {
  const file = pendingUploadFiles.get(messageId)
  if (!file || fileUploading.value) return
  fileUploading.value = true
  fileUploadError.value = ''
  try {
    await uploadFileForMessage(messageId, file)
  } catch {
    chatStore.markFileUploadFailed(messageId, '上传失败，请重试')
  } finally {
    fileUploading.value = false
  }
}

async function downloadAttachment(message: InitialChatMessage) {
  if (
    message.status !== 1 ||
    selectedSession.value?.groupClosed ||
    selectedSession.value?.groupAccessRevoked ||
    downloadingFiles.has(message.messageId)
  ) return
  downloadingFiles.add(message.messageId)
  fileDownloadErrors.delete(message.messageId)
  try {
    const blob = await chatApi.downloadFile(message.messageId)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = message.fileName || 'WeTalk-attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    fileDownloadErrors.set(message.messageId, '文件下载失败，请稍后重试')
  } finally {
    downloadingFiles.delete(message.messageId)
  }
}

function formatFileSize(value?: number) {
  const bytes = Number(value) || 0
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function fileUploadStatus(message: InitialChatMessage) {
  if (message.uploadError) return message.uploadError
  if (message.status === 1) return '已上传 · ' + formatFileSize(message.fileSize)
  if (message.uploadProgress !== undefined) return '正在上传 ' + message.uploadProgress + '%'
  return '等待上传'
}

function formatMessageTime(sendTime: number) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(sendTime))
}

async function signOut() {
  signingOut.value = true
  try {
    await authApi.logout()
  } catch {
    // Clear the browser session even if the server is unreachable.
  } finally {
    chatStore.clear()
    authStore.clearSession()
    signingOut.value = false
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <main class="chat-shell">
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航菜单"
      @click="sidebarOpen = false"
    ></button>

    <aside class="chat-sidebar" :class="{ 'is-open': sidebarOpen }">
      <div class="sidebar-top">
        <RouterLink class="sidebar-brand" :to="{ name: 'chat' }" aria-label="WeTalk">
          <span class="brand-mark">W</span>
          <span>WeTalk</span>
        </RouterLink>
        <button class="icon-button mobile-menu-close" type="button" aria-label="关闭菜单" @click="sidebarOpen = false">
          ×
        </button>
      </div>

      <button class="new-chat-button" type="button" disabled>
        <span aria-hidden="true">＋</span>
        新聊天
      </button>
      <button
        class="new-chat-button contact-add-button"
        data-testid="open-contact-search"
        type="button"
        @click="openContactSearch"
      >
        <span aria-hidden="true">＋</span>
        添加联系人
      </button>
      <button
        class="new-chat-button contact-directory-button"
        data-testid="open-contact-directory"
        type="button"
        @click="openContactDirectory"
      >
        <span aria-hidden="true">☷</span>
        联系人
      </button>
      <button
        class="new-chat-button group-directory-button"
        data-testid="open-group-directory"
        type="button"
        @click="openGroupDirectory"
      >
        <span aria-hidden="true">▦</span>
        群聊
      </button>

      <section class="history-section" aria-label="聊天记录">
        <p class="sidebar-label">最近的聊天</p>
        <p v-if="!chatStore.initialized" class="history-empty">
          {{ chatStore.connectionError || connectionLabel }}
        </p>
        <p v-else-if="chatStore.sessionList.length === 0" class="history-empty">还没有聊天会话</p>
        <div v-else class="chat-session-list">
          <button
            v-for="session in chatStore.sessionList"
            :key="session.sessionId"
            class="chat-session-entry"
            :class="{ 'is-active': session.sessionId === selectedSessionId }"
            type="button"
            @click="selectedSessionId = session.sessionId"
          >
            <span class="session-avatar" aria-hidden="true">{{ (session.contactName || 'W').slice(0, 1) }}</span>
            <span class="session-entry-copy">
              <strong>{{ session.contactName || session.contactId }}</strong>
              <small>{{ session.lastMessage || '开始一段新对话' }}</small>
            </span>
          </button>
        </div>
        <button
          v-if="chatStore.initialized"
          class="pending-apply-count"
          data-testid="open-contact-applications"
          type="button"
          aria-haspopup="dialog"
          @click="openContactApplications"
        >
          <span>好友申请</span>
          <span v-if="chatStore.applyCount > 0" class="pending-apply-badge">
            {{ chatStore.applyCount > 99 ? '99+' : chatStore.applyCount }}
          </span>
        </button>
      </section>

      <div class="sidebar-bottom">
        <button
          class="profile-trigger"
          data-testid="open-profile"
          type="button"
          aria-haspopup="dialog"
          @click="openProfile"
        >
          <span class="profile-avatar" aria-hidden="true">{{ avatarInitial }}</span>
          <span class="profile-copy">
            <strong>{{ displayName }}</strong>
            <span>{{ profile?.email || authStore.session?.email }}</span>
          </span>
        </button>
        <button
          class="icon-button signout-button"
          data-testid="signout"
          type="button"
          :disabled="signingOut"
          aria-label="退出登录"
          title="退出登录"
          @click="signOut"
        >
          ↗
        </button>
      </div>
    </aside>

    <section class="chat-main">
      <header class="chat-topbar">
        <button class="icon-button mobile-menu-open" type="button" aria-label="打开导航菜单" @click="sidebarOpen = true">
          ☰
        </button>
        <span class="chat-topbar-title">{{ selectedSession?.contactName || 'WeTalk' }}</span>
        <small
          v-if="selectedSession?.contactType === 1 && typeof selectedSession.memberCount === 'number'"
          class="group-member-count"
          data-testid="group-member-count"
        >{{ selectedSession.memberCount }} 位成员</small>
        <span class="connection-status" :class="`is-${chatStore.connectionStatus}`" data-testid="connection-status">
          <i aria-hidden="true"></i>{{ connectionLabel }}
        </span>
      </header>

      <div v-if="selectedSession" ref="messagePanel" class="conversation-panel" data-testid="message-panel">
        <div v-if="historyLoading && selectedMessages.length === 0" class="conversation-empty">
          <p class="eyebrow">正在加载历史消息</p>
          <p class="welcome-copy">正在从服务器读取这个会话的文字记录。</p>
          <p v-if="historyError" class="message-history-error" role="alert">{{ historyError }}</p>
        </div>
        <div v-else-if="selectedMessages.length === 0" class="conversation-empty">
          <div class="welcome-mark" aria-hidden="true">{{ (selectedSession.contactName || 'W').slice(0, 1) }}</div>
          <p class="eyebrow">会话已同步</p>
          <h1>{{ selectedSession.contactName || selectedSession.contactId }}</h1>
          <p class="welcome-copy">还没有文字消息，发送一条消息开始对话。</p>
          <p v-if="historyError" class="message-history-error" role="alert">{{ historyError }}</p>
        </div>
        <div v-else class="message-list" role="log" aria-label="聊天消息" aria-live="polite">
          <p v-if="historyError" class="message-history-error" role="alert">{{ historyError }}</p>
          <button
            v-if="currentHistory?.hasMore"
            class="load-older-button"
            data-testid="load-older-messages"
            type="button"
            :disabled="olderMessagesLoading"
            @click="loadOlderMessages"
          >
            {{ olderMessagesLoading ? '正在加载…' : '加载更早的消息' }}
          </button>
          <template v-for="(message, index) in selectedMessages" :key="message.messageId">
            <time
              v-if="shouldShowMessageTime(message, selectedMessages[index - 1])"
              class="message-time-divider"
              :datetime="new Date(message.sendTime).toISOString()"
            >
              {{ formatMessageTimeDivider(message.sendTime) }}
            </time>
            <article
              class="message-row"
              :class="{ 'is-mine': (message.messageType === 2 || message.messageType === 5) && message.sendUserId === authStore.session?.userId, 'is-system': message.messageType !== 2 && message.messageType !== 5 }"
              :data-testid="`message-${message.messageId}`"
            >
              <div class="message-bubble">
                <strong
                  v-if="(message.messageType === 2 || message.messageType === 5) && message.sendUserId !== authStore.session?.userId"
                  class="message-sender"
                >
                  {{ message.sendUserNickName }}
                </strong>
                <div v-if="message.messageType === 5" class="file-message-card" data-testid="file-attachment">
                  <div class="file-message-main">
                    <span class="file-message-mark" aria-hidden="true">FILE</span>
                    <span class="file-message-copy">
                      <strong>{{ message.fileName || '附件' }}</strong>
                      <small>{{ formatFileSize(message.fileSize) }}</small>
                    </span>
                  </div>
                  <div class="file-message-status">
                    <span>{{ fileUploadStatus(message) }}</span>
                    <button
                      class="file-download-button"
                      data-testid="download-file"
                      type="button"
                      :disabled="message.status !== 1 || downloadingFiles.has(message.messageId) || Boolean(selectedSession?.groupClosed || selectedSession?.groupAccessRevoked)"
                      @click="downloadAttachment(message)"
                    >{{ downloadingFiles.has(message.messageId) ? '下载中…' : '下载' }}</button>
                    <button
                      v-if="message.uploadError && pendingUploadFiles.has(message.messageId)"
                      class="file-upload-retry"
                      type="button"
                      :disabled="fileUploading"
                      @click="retryFileUpload(message.messageId)"
                    >重试上传</button>
                  </div>
                  <small v-if="fileDownloadErrors.has(message.messageId)" class="file-download-error" role="alert">
                    {{ fileDownloadErrors.get(message.messageId) }}
                  </small>
                </div>
                <p v-else>{{ message.messageContent }}</p>
                <div class="message-footer">
                  <time>{{ formatMessageTime(message.sendTime) }}</time>
                  <span
                    v-if="message.messageType === 2 && message.sendUserId === authStore.session?.userId"
                    class="message-send-status"
                    aria-label="服务端已接收并保存"
                    data-testid="message-send-status"
                  >
                    已发送
                  </span>
                </div>
              </div>
            </article>
          </template>
        </div>
      </div>

      <div v-else class="chat-welcome">
        <div class="welcome-mark" aria-hidden="true">W</div>
        <p class="eyebrow">{{ chatStore.initialized ? '会话已同步' : connectionLabel }}</p>
        <h1>今天想聊点什么？</h1>
        <p class="welcome-copy">
          {{ chatStore.initialized ? '当前还没有聊天会话。' : '正在从服务器同步会话和最近消息。' }}
        </p>
      </div>

      <p v-if="messageError" class="composer-error" role="alert">{{ messageError }}</p>
      <p v-if="fileUploadError" class="composer-error" data-testid="file-upload-error" role="alert">{{ fileUploadError }}</p>
      <p v-if="selectedSession?.groupClosed" class="group-session-notice" role="status">
        群聊已解散，无法继续发送消息。
      </p>
      <p v-else-if="selectedSession?.groupAccessRevoked" class="group-session-notice" role="status">
        你已退出或被移出群聊，无法继续发送消息。
      </p>
      <div class="composer-preview" aria-label="聊天输入框">
        <input
          ref="fileInput"
          class="file-attach-input"
          data-testid="file-input"
          type="file"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || fileUploading"
          @change="selectAttachment"
        />
        <button
          class="file-attach-button"
          data-testid="attach-file"
          type="button"
          aria-label="选择普通文件"
          title="选择普通文件"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || fileUploading"
          @click="chooseAttachment"
        >＋</button>
        <textarea
          v-model="messageDraft"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || sendingMessage"
          rows="2"
          maxlength="500"
          placeholder="发送文字消息，Enter 发送，Shift+Enter 换行"
          data-testid="message-composer"
          @keydown.enter.exact.prevent="sendTextMessage"
        ></textarea>
        <button
          class="composer-send"
          type="button"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || !messageDraft.trim() || sendingMessage"
          :aria-label="sendingMessage ? '正在发送' : '发送消息'"
          data-testid="send-message"
          @click="sendTextMessage"
        >
          <span v-if="sendingMessage" aria-hidden="true">…</span>
          <span v-else aria-hidden="true">↑</span>
        </button>
      </div>
      <p class="chat-disclaimer">文字消息由 WeTalk 后端保存并实时同步；历史记录支持分页，本机仅缓存纯文字消息。</p>
    </section>

    <ContactDirectoryDialog
      v-if="contactDirectoryOpen"
      @close="contactDirectoryOpen = false"
      @contacts-changed="refreshChatSession"
    />

    <GroupDirectoryDialog
      v-if="groupDirectoryOpen"
      :current-user-id="authStore.session?.userId || ''"
      :refresh-key="groupDirectoryRefreshKey"
      @close="groupDirectoryOpen = false"
    />

    <ContactApplicationsDialog
      v-if="contactApplicationsOpen"
      @close="contactApplicationsOpen = false"
      @application-handled="refreshChatSession"
    />

    <ContactSearchDialog
      v-if="contactSearchOpen"
      :current-user-id="authStore.session?.userId || ''"
      :display-name="displayName"
      @close="contactSearchOpen = false"
      @contact-added="refreshChatSession"
    />

    <div v-if="profileOpen" class="profile-overlay" data-testid="profile-overlay" @click.self="closeProfile">
      <section
        class="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeProfile"
      >
        <header class="profile-dialog-header">
          <div>
            <p class="eyebrow">账号</p>
            <h2 id="profile-title">个人资料与安全</h2>
          </div>
          <button class="icon-button profile-close" type="button" aria-label="关闭个人资料" @click="closeProfile">
            ×
          </button>
        </header>

        <p v-if="profileLoading" class="profile-status" role="status">正在读取个人资料…</p>
        <p v-else-if="profileError" class="profile-load-error" role="alert">{{ profileError }}</p>

        <dl class="profile-details">
          <div>
            <dt>昵称</dt>
            <dd>{{ profile?.nickName || authStore.session?.nickName || '—' }}</dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>{{ profile?.email || authStore.session?.email || '—' }}</dd>
          </div>
          <div>
            <dt>账号编号</dt>
            <dd>{{ profile?.userId || authStore.session?.userId || '—' }}</dd>
          </div>
        </dl>

        <div class="text-cache-controls">
          <div>
            <h3>本机文字缓存</h3>
            <p>按当前账号保存最近查看的文字消息，不保存 token、密码或附件。</p>
          </div>
          <button
            class="text-cache-clear"
            data-testid="clear-text-cache"
            type="button"
            :disabled="clearingTextCache"
            @click="clearLocalTextCache"
          >
            {{ clearingTextCache ? '正在清除…' : '清除缓存' }}
          </button>
          <p v-if="cacheNotice" class="cache-status" role="status">{{ cacheNotice }}</p>
        </div>

        <form class="password-form" data-testid="password-form" @submit.prevent="changePassword">
          <div>
            <h3>修改密码</h3>
            <p class="password-note">修改成功后会退出当前账号，请使用新密码重新登录。</p>
          </div>
          <label for="new-password">新密码</label>
          <input
            id="new-password"
            v-model="passwordForm.password"
            data-testid="new-password"
            type="password"
            autocomplete="new-password"
            placeholder="8–18 位，包含英文字母和数字"
          />
          <label for="confirm-new-password">确认新密码</label>
          <input
            id="confirm-new-password"
            v-model="passwordForm.confirmPassword"
            data-testid="confirm-new-password"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入新密码"
          />
          <p v-if="passwordError" class="profile-form-error" data-testid="password-error" role="alert">
            {{ passwordError }}
          </p>
          <button class="password-submit" data-testid="update-password" type="submit" :disabled="changingPassword">
            {{ changingPassword ? '正在修改…' : '更新密码' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>
