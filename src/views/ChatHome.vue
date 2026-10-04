<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { appUpdateApi, type AppUpdateNotice } from '@/api/appUpdates'
import { authApi } from '@/api/auth'
import type { SaveUserInfoInput, UserProfile, UserSessionInfo } from '@/api/auth'
import { chatApi } from '@/api/chat'
import AvatarThumbnail from '@/components/AvatarThumbnail.vue'
import ContactApplicationsDialog from '@/components/ContactApplicationsDialog.vue'
import ContactDirectoryDialog from '@/components/ContactDirectoryDialog.vue'
import ContactSearchDialog from '@/components/ContactSearchDialog.vue'
import GroupDirectoryDialog from '@/components/GroupDirectoryDialog.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import { useAuthStore } from '@/stores/auth'
import { compareMessagesByServerOrder, useChatStore, type ChatHistoryPage, type InitialChatMessage } from '@/stores/chat'
import { useDownloadPreferencesStore } from '@/stores/downloadPreferences'
import { useConversationPreferencesStore } from '@/stores/conversationPreferences'
import { useSystemSettingsStore } from '@/stores/systemSettings'
import type { DownloadLocationMode } from '@/storage/downloadPreferences'
import { textMessageCache, type PendingTextMessage } from '@/storage/textMessageCache'
import { createVideoCover } from '@/utils/videoThumbnail'
import { getChatFileType, getChatMediaKind, getChatMediaMimeType, validateChatFile } from '@/utils/fileValidation'
import { validatePassword } from '@/utils/authValidation'
import { validateProfileImageUpload } from '@/utils/imageValidation'
import { formatMessageTimeDivider, shouldShowMessageTime } from '@/utils/messageTime'
import { createClientMessageId } from '@/utils/clientMessageId'
import { trapDialogTab } from '@/composables/useDialogFocus'
import { webClientVersion } from '@/config/version'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const conversationPreferences = useConversationPreferencesStore()
conversationPreferences.load(authStore.session?.userId || '')
const showRemovedConversations = ref(false)
const visibleSessions = computed(() => chatStore.sessionList
  .filter((session) => !conversationPreferences.isHidden(session))
  .sort((left, right) => Number(conversationPreferences.pinned.includes(right.sessionId))
    - Number(conversationPreferences.pinned.includes(left.sessionId)) || right.lastReceiveTime - left.lastReceiveTime))
const removedSessions = computed(() => chatStore.sessionList.filter((session) => conversationPreferences.isHidden(session)))
const downloadPreferencesStore = useDownloadPreferencesStore()
const systemSettingsStore = useSystemSettingsStore()
const sidebarOpen = ref(false)
const sidebarCollapsed = ref(false)
const desktopSidebarCollapseButton = ref<HTMLButtonElement | null>(null)
const desktopSidebarExpandButton = ref<HTMLButtonElement | null>(null)
const mobileMenuTrigger = ref<HTMLElement | null>(null)
const mobileMenuCloseButton = ref<HTMLButtonElement | null>(null)
const chatNavigation = ref<HTMLElement | null>(null)
const messageComposer = ref<HTMLTextAreaElement | null>(null)
const signingOut = ref(false)
const selectedSessionId = ref('')
const pendingTextMessage = ref<PendingTextMessage | null>(null)
const pendingTextMessages = ref<PendingTextMessage[]>([])
const replayingPendingMessages = ref(false)
const pendingQueueError = ref('')
const pendingReadCursors = new Map<string, { contactId: string; messageId: number }>()
const lastReadCursorBySession = new Map<string, number>()
let flushingReadCursors = false
const contactSearchOpen = ref(false)
const contactApplicationsOpen = ref(false)
const contactDirectoryOpen = ref(false)
const groupDirectoryOpen = ref(false)
const groupDirectoryRefreshKey = ref(0)
const profileMenuOpen = ref(false)
const profileMenu = ref<HTMLElement | null>(null)
const profileMenuFirstAction = ref<HTMLButtonElement | null>(null)
const profileOpen = ref(false)
const profileLoading = ref(false)
const profileError = ref('')
const profile = ref<UserProfile | null>(null)
const profileEditOpen = ref(false)
const profileSaving = ref(false)
const profileSaveError = ref('')
const profileSaveNotice = ref('')
const userSessions = ref<UserSessionInfo[]>([])
const sessionsLoading = ref(false)
const sessionsError = ref('')
const sessionsNotice = ref('')
const sessionActionId = ref('')
const confirmSessionToRevoke = ref('')
const confirmRevokeOtherSessions = ref(false)
const sessionRefreshButton = ref<HTMLButtonElement | null>(null)
const hasOtherSessions = computed(() => userSessions.value.some((session) => !session.current))
const profileAvatarVersion = ref(0)
const profileAvatarFile = ref<File | null>(null)
const profileCoverFile = ref<File | null>(null)
const profileAvatarInput = ref<HTMLInputElement | null>(null)
const profileCoverInput = ref<HTMLInputElement | null>(null)
const profileForm = reactive({
  nickName: '',
  sex: '' as '' | '0' | '1',
  personalSignature: '',
  areaName: '',
  areaCode: '',
  joinType: 1 as 0 | 1,
})
const passwordForm = reactive({ password: '', confirmPassword: '' })
const passwordError = ref('')
const changingPassword = ref(false)
const clearingTextCache = ref(false)
const cacheNotice = ref('')
const webReleaseNotice = ref<AppUpdateNotice | null>(null)
const webReleaseNoticeDismissed = ref(false)
const downloadPreferenceNotice = ref('')
const downloadPreferenceError = ref('')

const displayName = computed(() => profile.value?.nickName || authStore.session?.nickName || 'WeTalk 用户')
const avatarInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())
const selectedSession = computed(
  () => chatStore.sessionList.find((session) => session.sessionId === selectedSessionId.value) || null,
)
const activeSessionLatestMessageId = computed(() =>
  chatStore.initialMessages.reduce(
    (latest, message) => message.sessionId === selectedSessionId.value ? Math.max(latest, message.messageId) : latest,
    0,
  ),
)
const webReleaseLink = computed(() => {
  const rawLink = webReleaseNotice.value?.outerLink?.trim()
  if (!rawLink) return ''
  try {
    const url = new URL(rawLink)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
})
const messageSearchOpen = ref(false)
const messageSearchQuery = ref('')
const searchJumpMessageId = ref<number | null>(null)
const messageSearchInput = ref<HTMLInputElement | null>(null)
const messageSearchTrigger = ref<HTMLButtonElement | null>(null)
const sidebarDialogReturnFocusTarget = ref<HTMLElement | null>(null)
const fullHistorySearchMatches = ref<InitialChatMessage[]>([])
const fullHistorySearchPages = ref(new Map<number, ChatHistoryPage>())
const fullHistorySearchStatus = ref<'idle' | 'searching' | 'complete' | 'cancelled' | 'error'>('idle')
const fullHistorySearchScanned = ref(0)
const fullHistorySearchTotal = ref<number | null>(null)
const fullHistorySearchBeforeMessageId = ref<number | null>(null)
const fullHistorySearchError = ref('')
let fullHistorySearchRequestId = 0
let fullHistorySearchAbortController: AbortController | null = null
const conversationMessages = computed(() =>
  chatStore.initialMessages
    .filter((message) => message.sessionId === selectedSessionId.value && [2, 3, 5, 8, 9, 11, 12, 14].includes(message.messageType))
    .sort(compareMessagesByServerOrder)
)
const selectedMessages = computed(() => {
  const messages = conversationMessages.value
  if (searchJumpMessageId.value !== null) {
    const targetIndex = messages.findIndex((message) => message.messageId === searchJumpMessageId.value)
    if (targetIndex >= 0) return messages.slice(Math.max(0, targetIndex - 40), targetIndex + 40)
  }
  return messages.slice(-80)
})
function matchesMessageSearch(message: InitialChatMessage, query: string) {
  return [message.messageContent, message.fileName, message.sendUserNickName]
    .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(query))
}
const messageSearchResults = computed(() => {
  const query = messageSearchQuery.value.trim().toLocaleLowerCase()
  if (!query) return []
  const candidates = new Map<number, InitialChatMessage>()
  for (const message of [...chatStore.initialMessages, ...fullHistorySearchMatches.value]) {
    if (
      message.sessionId === selectedSessionId.value &&
      [2, 5, 14].includes(message.messageType) &&
      matchesMessageSearch(message, query)
    ) candidates.set(message.messageId, message)
  }
  return [...candidates.values()]
    .sort((a, b) => compareMessagesByServerOrder(b, a))
    .slice(0, 50)
})
const currentHistory = computed(() => chatStore.historyBySession[selectedSessionId.value] || null)
const messageDraft = ref('')
const sendingMessage = ref(false)
const messageError = ref('')
const stoppingAiMessageId = ref<number | null>(null)
const aiActionErrorMessageId = ref<number | null>(null)
const aiActionError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const fileUploadError = ref('')
const fileUploading = ref(false)
const fileDragActive = ref(false)
const pendingUploadFiles = reactive(new Map<number, { file: File; cover: File | null }>())
const downloadingFiles = reactive(new Set<number>())
const fileDownloadErrors = reactive(new Map<number, string>())
const mediaPreviewMessage = ref<InitialChatMessage | null>(null)
const mediaPreviewUrl = ref('')
const mediaPreviewLoadingId = ref<number | null>(null)
const mediaPreviewErrors = reactive(new Map<number, string>())
const mediaPreviewDialog = ref<HTMLElement | null>(null)
const mediaPreviewTrigger = ref<HTMLElement | null>(null)
const profileDialog = ref<HTMLElement | null>(null)
const profileContent = ref<HTMLElement | null>(null)
const profileSections = [
  { id: 'account', label: '个人资料' },
  { id: 'preferences', label: '偏好设置' },
  { id: 'sessions', label: '登录设备' },
  { id: 'security', label: '账号安全' },
] as const
type ProfileSectionId = (typeof profileSections)[number]['id']
const profileSectionIds: readonly ProfileSectionId[] = profileSections.map(({ id }) => id)
const activeProfileSection = ref<ProfileSectionId>('account')
const profileTrigger = ref<HTMLButtonElement | null>(null)
const profileCloseButton = ref<HTMLButtonElement | null>(null)
const messagePanel = ref<HTMLElement | null>(null)
const chatShell = ref<HTMLElement | null>(null)
const historyLoading = ref(false)
const olderMessagesLoading = ref(false)
const historyError = ref('')
const preservingScroll = ref(false)
let historyRequestId = 0
let fileDragDepth = 0
let chatVisualViewport: VisualViewport | null = null
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
  visibleSessions,
  (sessions) => {
    if (!sessions.some((session) => session.sessionId === selectedSessionId.value)) {
      selectedSessionId.value = sessions[0]?.sessionId || ''
    }
  },
  { immediate: true },
)

watch(() => chatStore.sessionList, (sessions) => conversationPreferences.restoreUpdated(sessions), { deep: true })

watch(selectedSessionId, (sessionId) => {
  chatStore.setActiveSession(sessionId)
  messageSearchQuery.value = ''
  searchJumpMessageId.value = null
  void loadLatestHistory(sessionId)
})

watch(activeSessionLatestMessageId, (messageId) => {
  if (selectedSessionId.value && messageId > 0) {
    markConversationRead(selectedSessionId.value, messageId)
  }
})

watch(messageSearchQuery, () => {
  resetFullHistorySearch()
  searchJumpMessageId.value = null
}, { flush: 'sync' })

watch(
  () => chatStore.groupEventVersion,
  (version, previousVersion) => {
    if (version !== previousVersion && groupDirectoryOpen.value) groupDirectoryRefreshKey.value += 1
  },
)

watch(selectedMessages, async () => {
  if (preservingScroll.value) return
  await nextTick()
  if (searchJumpMessageId.value !== null) {
    const target = messagePanel.value?.querySelector(`[data-testid="message-${searchJumpMessageId.value}"]`)
    target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    return
  }
  if (messagePanel.value) messagePanel.value.scrollTop = messagePanel.value.scrollHeight
})

onMounted(() => {
  window.addEventListener('online', handlePendingMessagesOnline)
  chatVisualViewport = window.visualViewport
  window.addEventListener('resize', syncChatViewportHeight)
  chatVisualViewport?.addEventListener('resize', syncChatViewportHeight)
  chatVisualViewport?.addEventListener('scroll', syncChatViewportHeight)
  syncChatViewportHeight()
  void loadProfile()
  void systemSettingsStore.load().catch(() => undefined)
  const session = authStore.session
  if (session?.userId) {
    void downloadPreferencesStore.load(session.userId)
    void loadWebReleaseNotice()
    chatStore.connect(session.userId)
    void restorePendingTextMessages(session.userId)
  }
})

async function loadWebReleaseNotice() {
  try {
    webReleaseNotice.value = await appUpdateApi.checkForUpdate(webClientVersion)
    webReleaseNoticeDismissed.value = false
  } catch {
    webReleaseNotice.value = null
  }
}

function dismissWebReleaseNotice() {
  webReleaseNoticeDismissed.value = true
}

function syncChatViewportHeight() {
  const shell = chatShell.value
  if (!shell) return
  const rootStyle = document.documentElement.style
  if (window.innerWidth <= 1024 && chatVisualViewport) {
    const height = Math.max(1, Math.round(chatVisualViewport.height))
    const top = Math.max(0, Math.round(chatVisualViewport.offsetTop))
    shell.style.setProperty('--wt-chat-visual-viewport-height', `${height}px`)
    shell.style.setProperty('--wt-chat-visual-viewport-top', `${top}px`)
    rootStyle.setProperty('--wt-chat-viewport-bottom', `${top + height}px`)
    document.documentElement.classList.add('wt-chat-viewport-lock')
  } else {
    shell.style.removeProperty('--wt-chat-visual-viewport-height')
    shell.style.removeProperty('--wt-chat-visual-viewport-top')
    rootStyle.removeProperty('--wt-chat-viewport-bottom')
    document.documentElement.classList.remove('wt-chat-viewport-lock')
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('online', handlePendingMessagesOnline)
  window.removeEventListener('resize', syncChatViewportHeight)
  chatVisualViewport?.removeEventListener('resize', syncChatViewportHeight)
  chatVisualViewport?.removeEventListener('scroll', syncChatViewportHeight)
  chatShell.value?.style.removeProperty('--wt-chat-visual-viewport-height')
  chatShell.value?.style.removeProperty('--wt-chat-visual-viewport-top')
  document.documentElement.style.removeProperty('--wt-chat-viewport-bottom')
  document.documentElement.classList.remove('wt-chat-viewport-lock')
  chatVisualViewport = null
  historyRequestId += 1
  resetFullHistorySearch()
  closeMediaPreview(false)
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

function openProfileEditor() {
  const current = profile.value
  if (!current) return
  profileForm.nickName = current.nickName || ''
  profileForm.sex = current.sex === 0 || current.sex === 1 ? String(current.sex) as '0' | '1' : ''
  profileForm.personalSignature = current.personalSignature || ''
  profileForm.areaName = current.areaName || ''
  profileForm.areaCode = current.areaCode || ''
  profileForm.joinType = current.joinType === 0 ? 0 : 1
  profileAvatarFile.value = null
  profileCoverFile.value = null
  if (profileAvatarInput.value) profileAvatarInput.value.value = ''
  if (profileCoverInput.value) profileCoverInput.value.value = ''
  profileSaveError.value = ''
  profileSaveNotice.value = ''
  profileEditOpen.value = true
}

function selectProfileImage(event: Event, kind: 'avatar' | 'cover') {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] || null
  profileSaveError.value = ''
  if (!file) {
    if (kind === 'avatar') profileAvatarFile.value = null
    else profileCoverFile.value = null
    return
  }

  const validationError = validateProfileImageUpload(file)
  if (validationError) {
    profileSaveError.value = validationError
    input.value = ''
    return
  }
  if (kind === 'avatar') profileAvatarFile.value = file
  else profileCoverFile.value = file
}

function cancelProfileEdit() {
  if (profileSaving.value) return
  profileEditOpen.value = false
  profileAvatarFile.value = null
  profileCoverFile.value = null
  profileSaveError.value = ''
}

async function saveProfile() {
  const nickName = profileForm.nickName.trim()
  if (!nickName || nickName.length > 40) {
    profileSaveError.value = '昵称不能为空且不能超过 40 个字符'
    return
  }
  if (profileForm.personalSignature.length > 64 || profileForm.areaName.length > 64 || profileForm.areaCode.length > 64) {
    profileSaveError.value = '个性签名和地区字段不能超过 64 个字符'
    return
  }

  const input: SaveUserInfoInput = {
    nickName,
    personalSignature: profileForm.personalSignature.trim(),
    areaName: profileForm.areaName.trim(),
    areaCode: profileForm.areaCode.trim(),
    joinType: profileForm.joinType,
    avatarFile: profileAvatarFile.value,
    coverFile: profileCoverFile.value,
  }
  if (profileForm.sex !== '') input.sex = Number(profileForm.sex)

  profileSaving.value = true
  profileSaveError.value = ''
  profileSaveNotice.value = ''
  try {
    const updated = await authApi.saveUserInfo(input)
    profile.value = updated
    const session = authStore.session
    if (session) {
      authStore.setSession({
        ...session,
        email: updated.email || session.email,
        nickName: updated.nickName || session.nickName,
        admin: updated.admin,
      })
    }
    profileAvatarVersion.value += 1
    profileSaveNotice.value = '个人资料已保存'
    profileAvatarFile.value = null
    profileCoverFile.value = null
    profileEditOpen.value = false
  } catch (error: unknown) {
    profileSaveError.value = error instanceof Error ? error.message : '资料保存失败，请稍后重试'
  } finally {
    profileSaving.value = false
  }
}

async function openMobileNavigation(event: MouseEvent) {
  mobileMenuTrigger.value = event.currentTarget as HTMLElement
  sidebarOpen.value = true
  await nextTick()
  mobileMenuCloseButton.value?.focus()
}

function closeMobileNavigation(restoreFocus = true) {
  sidebarOpen.value = false
  const trigger = mobileMenuTrigger.value
  if (restoreFocus && trigger) {
    void nextTick().then(() => {
      if (trigger.isConnected) trigger.focus()
    })
  }
}

function collapseDesktopSidebar() {
  closeProfileMenu()
  sidebarCollapsed.value = true
  void nextTick(() => desktopSidebarExpandButton.value?.focus())
}

function expandDesktopSidebar() {
  sidebarCollapsed.value = false
  void nextTick(() => desktopSidebarCollapseButton.value?.focus())
}

function selectChatSession(sessionId: string) {
  conversationPreferences.restore(sessionId)
  selectedSessionId.value = sessionId
  if (sidebarOpen.value) {
    sidebarOpen.value = false
    void nextTick(() => messageComposer.value?.focus())
  }
}

function trapMobileNavigationFocus(event: KeyboardEvent) {
  const navigation = chatNavigation.value
  if (!sidebarOpen.value || event.key !== 'Tab' || !navigation) return
  const focusable = Array.from(navigation.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ))
  if (focusable.length === 0) {
    event.preventDefault()
    navigation.focus()
    return
  }
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (!navigation.contains(document.activeElement)) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
  } else if (event.shiftKey && (document.activeElement === first || document.activeElement === navigation)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === navigation)) {
    event.preventDefault()
    first.focus()
  }
}

function openProfile() {
  profileMenuOpen.value = false
  profileOpen.value = true
  activeProfileSection.value = 'account'
  profileEditOpen.value = false
  profileSaveError.value = ''
  profileSaveNotice.value = ''
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  passwordError.value = ''
  userSessions.value = []
  confirmSessionToRevoke.value = ''
  confirmRevokeOtherSessions.value = false
  void nextTick(() => {
    if (profileContent.value) profileContent.value.scrollTop = 0
    profileCloseButton.value?.focus()
  })
  void loadSessions()
}

function toggleProfileMenu() {
  if (signingOut.value) return
  if (profileMenuOpen.value) {
    closeProfileMenuAndRestoreFocus()
    return
  }
  profileMenuOpen.value = true
  void nextTick(() => profileMenuFirstAction.value?.focus())
}

function closeProfileMenu() {
  profileMenuOpen.value = false
}

function closeProfileMenuAndRestoreFocus() {
  closeProfileMenu()
  void nextTick(() => profileTrigger.value?.focus())
}

function openProfileFromMenu() {
  closeProfileMenu()
  openProfile()
}

function handleProfileMenuFocusOut(event: FocusEvent) {
  const anchor = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return
  closeProfileMenu()
}

function handleProfileMenuKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeProfileMenuAndRestoreFocus()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = Array.from(profileMenu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])
  if (!items.length) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items[items.length - 1]?.focus()
    return
  }

  const direction = event.key === 'ArrowDown' ? 1 : -1
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

function formatSessionTime(timestamp: number) {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString()
}

async function loadSessions() {
  sessionsLoading.value = true
  sessionsError.value = ''
  sessionsNotice.value = ''
  try {
    userSessions.value = await authApi.listSessions()
  } catch (error: unknown) {
    sessionsError.value = error instanceof Error ? error.message : '设备会话读取失败，请稍后重试'
  } finally {
    sessionsLoading.value = false
  }
}

async function revokeSession(session: UserSessionInfo) {
  if (session.current || sessionActionId.value) return
  sessionActionId.value = session.sessionId
  sessionsError.value = ''
  try {
    await authApi.revokeSession(session.sessionId)
    userSessions.value = userSessions.value.filter((item) => item.sessionId !== session.sessionId)
    confirmSessionToRevoke.value = ''
    sessionsNotice.value = `已退出“${session.deviceName}”`
    await nextTick()
    sessionRefreshButton.value?.focus()
  } catch (error: unknown) {
    sessionsError.value = error instanceof Error ? error.message : '退出设备失败，请稍后重试'
  } finally {
    sessionActionId.value = ''
  }
}

async function revokeOtherSessions() {
  if (sessionActionId.value || !userSessions.value.some((session) => !session.current)) return
  sessionActionId.value = 'others'
  sessionsError.value = ''
  try {
    const result = await authApi.revokeOtherSessions()
    userSessions.value = userSessions.value.filter((session) => session.current)
    confirmRevokeOtherSessions.value = false
    sessionsNotice.value = `已退出 ${result.revokedCount} 台其他设备`
    await nextTick()
    sessionRefreshButton.value?.focus()
  } catch (error: unknown) {
    sessionsError.value = error instanceof Error ? error.message : '退出其他设备失败，请稍后重试'
  } finally {
    sessionActionId.value = ''
  }
}

function closeContactSearchDialog() {
  contactSearchOpen.value = false
}

function closeContactApplicationsDialog() {
  contactApplicationsOpen.value = false
}

function closeContactDirectoryDialog() {
  contactDirectoryOpen.value = false
}

function closeGroupDirectoryDialog() {
  groupDirectoryOpen.value = false
}

function openAbout() {
  closeProfileMenu()
  profileOpen.value = false
  sidebarOpen.value = false
  void router.push({ name: 'about' })
}

function openAdminUsers() {
  closeProfileMenu()
  sidebarOpen.value = false
  void router.push({ name: 'admin-users' })
}

function openAdminGroups() {
  closeProfileMenu()
  sidebarOpen.value = false
  void router.push({ name: 'admin-groups' })
}

function openAdminSettings() {
  closeProfileMenu()
  sidebarOpen.value = false
  void router.push({ name: 'admin-settings' })
}

function openAdminBeautyAccounts() {
  closeProfileMenu()
  sidebarOpen.value = false
  void router.push({ name: 'admin-beauty-accounts' })
}

function openContactSearch(event: MouseEvent) {
  sidebarDialogReturnFocusTarget.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  contactSearchOpen.value = true
}

function openContactApplications(event: MouseEvent) {
  sidebarDialogReturnFocusTarget.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  contactApplicationsOpen.value = true
}

function openContactDirectory(event: MouseEvent) {
  sidebarDialogReturnFocusTarget.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  contactDirectoryOpen.value = true
}

function openGroupDirectory(event: MouseEvent) {
  sidebarDialogReturnFocusTarget.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  groupDirectoryOpen.value = true
}

function closeMessageSearch() {
  if (!messageSearchOpen.value) return
  messageSearchOpen.value = false
  messageSearchQuery.value = ''
  searchJumpMessageId.value = null
  const focusTarget = window.innerWidth <= 760 ? mobileMenuTrigger.value : messageSearchTrigger.value
  void nextTick(() => focusTarget?.focus())
}

function toggleMessageSearch() {
  if (messageSearchOpen.value) {
    closeMessageSearch()
    return
  }
  if (sidebarOpen.value) closeMobileNavigation(false)
  messageSearchOpen.value = true
  void nextTick(() => messageSearchInput.value?.focus())
}

function resetFullHistorySearch() {
  fullHistorySearchRequestId += 1
  fullHistorySearchAbortController?.abort()
  fullHistorySearchAbortController = null
  fullHistorySearchMatches.value = []
  fullHistorySearchPages.value = new Map()
  fullHistorySearchStatus.value = 'idle'
  fullHistorySearchScanned.value = 0
  fullHistorySearchTotal.value = null
  fullHistorySearchBeforeMessageId.value = null
  fullHistorySearchError.value = ''
}

function cancelFullHistorySearch() {
  if (fullHistorySearchStatus.value !== 'searching') return
  fullHistorySearchRequestId += 1
  fullHistorySearchAbortController?.abort()
  fullHistorySearchAbortController = null
  fullHistorySearchStatus.value = 'cancelled'
}

async function searchEntireHistory() {
  const session = selectedSession.value
  const query = messageSearchQuery.value.trim().toLocaleLowerCase()
  if (!session || !query || fullHistorySearchStatus.value === 'searching' || fullHistorySearchStatus.value === 'complete') return

  const sessionId = session.sessionId
  const requestId = ++fullHistorySearchRequestId
  const abortController = new AbortController()
  fullHistorySearchAbortController = abortController
  fullHistorySearchStatus.value = 'searching'
  fullHistorySearchError.value = ''
  let beforeMessageId = fullHistorySearchBeforeMessageId.value

  try {
    while (requestId === fullHistorySearchRequestId && selectedSessionId.value === sessionId) {
      const page = await chatApi.loadHistory(session.contactId, beforeMessageId, 50, abortController.signal)
      if (requestId !== fullHistorySearchRequestId || selectedSessionId.value !== sessionId) return

      const pageMessages = Array.isArray(page.list) ? page.list : []
      if (fullHistorySearchTotal.value === null) fullHistorySearchTotal.value = page.totalCount
      fullHistorySearchScanned.value += pageMessages.length

      const matchingMessages = pageMessages.filter((message) => matchesMessageSearch(message, query))
      const combined = new Map<number, InitialChatMessage>(
        fullHistorySearchMatches.value.map((message) => [message.messageId, message]),
      )
      for (const message of matchingMessages) combined.set(message.messageId, message)
      const topMatches = [...combined.values()]
        .sort((a, b) => compareMessagesByServerOrder(b, a))
        .slice(0, 50)
      fullHistorySearchMatches.value = topMatches

      const pageWithMessages = { ...page, list: pageMessages }
      const pagesByMessageId = new Map(fullHistorySearchPages.value)
      for (const message of matchingMessages) pagesByMessageId.set(message.messageId, pageWithMessages)
      const topIds = new Set(topMatches.map((message) => message.messageId))
      for (const messageId of pagesByMessageId.keys()) {
        if (!topIds.has(messageId)) pagesByMessageId.delete(messageId)
      }
      fullHistorySearchPages.value = pagesByMessageId

      const oldestMessageId = pageMessages.reduce((oldest, message) => {
        const messageId = Number(message.messageId)
        return Number.isSafeInteger(messageId) && messageId > 0 ? Math.min(oldest, messageId) : oldest
      }, Number.POSITIVE_INFINITY)
      const hasMore = page.pageNo < page.pageTotal && Number.isFinite(oldestMessageId) &&
        (beforeMessageId === null || oldestMessageId < beforeMessageId)
      if (!hasMore) {
        fullHistorySearchBeforeMessageId.value = null
        fullHistorySearchStatus.value = 'complete'
        return
      }

      beforeMessageId = oldestMessageId
      fullHistorySearchBeforeMessageId.value = oldestMessageId
    }
  } catch (error: unknown) {
    if (requestId === fullHistorySearchRequestId) {
      fullHistorySearchStatus.value = 'error'
      fullHistorySearchError.value = error instanceof Error ? error.message : '搜索历史消息失败，请重试'
    }
  } finally {
    if (requestId === fullHistorySearchRequestId) fullHistorySearchAbortController = null
  }
}

async function jumpToSearchResult(messageId: number) {
  const session = selectedSession.value
  if (!session) return
  if (!chatStore.initialMessages.some((message) => message.messageId === messageId)) {
    const page = fullHistorySearchPages.value.get(messageId)
    if (!page) return
    chatStore.setHistoryPage(session.sessionId, page, true)
  }
  searchJumpMessageId.value = messageId
  await nextTick()
  const target = messagePanel.value?.querySelector(`[data-testid="message-${messageId}"]`)
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
}

function returnToLatestMessages() {
  searchJumpMessageId.value = null
}

function refreshChatSession() {
  const session = authStore.session
  if (session?.userId) chatStore.connect(session.userId)
}

function closeProfile() {
  if (changingPassword.value || profileSaving.value || Boolean(sessionActionId.value)) return
  profileEditOpen.value = false
  profileOpen.value = false
  void nextTick(() => profileTrigger.value?.focus())
}

function trapProfileFocus(event: KeyboardEvent) {
  trapDialogTab(event, profileDialog.value)
}

function selectProfileSection(sectionId: ProfileSectionId) {
  activeProfileSection.value = sectionId
  const content = profileContent.value
  const section = document.getElementById(`profile-section-${sectionId}`)
  if (!content || !section) return
  const contentTop = content.getBoundingClientRect().top
  const sectionTop = section.getBoundingClientRect().top
  const nextScrollTop = content.scrollTop + sectionTop - contentTop
  if (typeof content.scrollTo === 'function') {
    content.scrollTo({ top: nextScrollTop, behavior: 'smooth' })
  } else {
    content.scrollTop = nextScrollTop
  }
}

function updateActiveProfileSection() {
  const content = profileContent.value
  if (!content) return
  const threshold = content.getBoundingClientRect().top + 24
  let currentSection: ProfileSectionId = profileSectionIds[0]!
  for (const sectionId of profileSectionIds) {
    const section = document.getElementById(`profile-section-${sectionId}`)
    if (section && section.getBoundingClientRect().top <= threshold) currentSection = sectionId
  }
  activeProfileSection.value = currentSection
}

function resizeMessageComposer() {
  const textarea = messageComposer.value
  if (!textarea) return
  const maxHeight = 160
  textarea.style.height = 'auto'
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 30), maxHeight)
  textarea.style.height = `${nextHeight}px`
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

async function clearLocalTextCache() {
  const accountId = authStore.session?.userId
  if (!accountId || clearingTextCache.value || replayingPendingMessages.value) return
  clearingTextCache.value = true
  cacheNotice.value = ''
  try {
    await textMessageCache.clearAccount(accountId)
    pendingTextMessages.value = []
    pendingTextMessage.value = null
    cacheNotice.value = '本机文字缓存已清除'
  } catch {
    cacheNotice.value = '缓存暂时无法清除，请稍后重试'
  } finally {
    clearingTextCache.value = false
  }
}

async function changeDownloadMode(event: Event) {
  const mode = (event.target as HTMLSelectElement).value as DownloadLocationMode
  downloadPreferenceNotice.value = ''
  downloadPreferenceError.value = ''
  try {
    await downloadPreferencesStore.setMode(mode)
    downloadPreferenceNotice.value = '下载偏好已保存'
  } catch (error: unknown) {
    downloadPreferenceError.value = error instanceof Error ? error.message : '下载偏好保存失败'
  }
}

async function chooseDownloadFolder() {
  downloadPreferenceNotice.value = ''
  downloadPreferenceError.value = ''
  try {
    const name = await downloadPreferencesStore.chooseDirectory()
    downloadPreferenceNotice.value = `已选择文件夹：${name}`
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    downloadPreferenceError.value = error instanceof Error ? error.message : '文件夹选择失败'
  }
}

async function clearDownloadFolder() {
  downloadPreferenceNotice.value = ''
  downloadPreferenceError.value = ''
  try {
    await downloadPreferencesStore.clearDirectory()
    downloadPreferenceNotice.value = '已清除所选文件夹，后续使用浏览器默认下载位置'
  } catch (error: unknown) {
    downloadPreferenceError.value = error instanceof Error ? error.message : '文件夹偏好清除失败'
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
    systemSettingsStore.reset()
    downloadPreferencesStore.reset()
    authStore.clearSession()
    await router.replace({ name: 'login', query: { passwordUpdated: '1' } })
  } catch (error: unknown) {
    passwordError.value = error instanceof Error ? error.message : '密码修改失败，请稍后重试'
  } finally {
    changingPassword.value = false
  }
}

function browserIsOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function handlePendingMessagesOnline() {
  pendingQueueError.value = ''
  void flushPendingReadCursors()
  void replayPendingTextMessages()
}

async function restorePendingTextMessages(accountId: string) {
  try {
    const pending = await textMessageCache.getPendingTextMessages(accountId)
    if (authStore.session?.userId !== accountId) return
    pendingTextMessages.value = pending
    if (pending.length && browserIsOnline()) void replayPendingTextMessages()
  } catch {
    pendingQueueError.value = '无法读取本机待发送消息；请保留草稿并稍后重试。'
  }
}

async function replayPendingTextMessages() {
  const accountId = authStore.session?.userId
  if (!accountId || replayingPendingMessages.value || !browserIsOnline()) return
  replayingPendingMessages.value = true
  pendingQueueError.value = ''
  try {
    const pending = await textMessageCache.getPendingTextMessages(accountId)
    pendingTextMessages.value = pending
    for (const item of pending) {
      if (!browserIsOnline() || authStore.session?.userId !== accountId) break
      try {
        const message = await chatApi.sendTextMessage(item.contactId, item.messageContent, item.clientMessageId)
        chatStore.appendMessage(message, true)
        await textMessageCache.deletePendingTextMessage(accountId, item.clientMessageId)
        pendingTextMessages.value = pendingTextMessages.value.filter(
          (pendingMessage) => pendingMessage.clientMessageId !== item.clientMessageId,
        )
      } catch (error: unknown) {
        pendingQueueError.value = error instanceof Error ? error.message : '待发送消息仍未送达，请稍后重试。'
        break
      }
    }
  } catch {
    pendingQueueError.value = '本机待发送消息暂时无法读取，请稍后重试。'
  } finally {
    replayingPendingMessages.value = false
  }
}

async function discardPendingTextMessage(clientMessageId: string) {
  const accountId = authStore.session?.userId
  if (!accountId) return
  try {
    await textMessageCache.deletePendingTextMessage(accountId, clientMessageId)
    pendingTextMessages.value = pendingTextMessages.value.filter((item) => item.clientMessageId !== clientMessageId)
    pendingQueueError.value = ''
  } catch {
    pendingQueueError.value = '无法从本机待发送队列移除这条消息。'
  }
}

function pendingContactName(message: PendingTextMessage) {
  return chatStore.sessionList.find((session) => session.sessionId === message.sessionId)?.contactName || message.contactId
}

function retryPendingMessages() {
  pendingQueueError.value = ''
  void replayPendingTextMessages()
}

function markConversationRead(sessionId: string, messageId: number) {
  const session = chatStore.sessionList.find((item) => item.sessionId === sessionId)
  if (!session || messageId < 1) return
  const pending = pendingReadCursors.get(sessionId)
  const lastRead = Math.max(lastReadCursorBySession.get(sessionId) || 0, pending?.messageId || 0)
  if (messageId <= lastRead) return
  pendingReadCursors.set(sessionId, { contactId: session.contactId, messageId })
  if (browserIsOnline()) void flushPendingReadCursors()
}

async function flushPendingReadCursors() {
  if (flushingReadCursors || !browserIsOnline() || !authStore.session?.userId) return
  flushingReadCursors = true
  try {
    while (pendingReadCursors.size > 0 && browserIsOnline() && authStore.session?.userId) {
      const next = pendingReadCursors.entries().next().value as
        | [string, { contactId: string; messageId: number }]
        | undefined
      if (!next) break
      const [sessionId, cursor] = next
      try {
        await chatApi.markRead(cursor.contactId, cursor.messageId)
        lastReadCursorBySession.set(sessionId, Math.max(lastReadCursorBySession.get(sessionId) || 0, cursor.messageId))
        const current = pendingReadCursors.get(sessionId)
        if (current && current.messageId <= cursor.messageId) pendingReadCursors.delete(sessionId)
      } catch {
        break
      }
    }
  } finally {
    flushingReadCursors = false
  }
}

async function sendTextMessage() {
  const content = messageDraft.value.trim()
  const selected = selectedSession.value
  if (
    !selected ||
    selected.groupClosed ||
    selected.groupAccessRevoked ||
    !content ||
    sendingMessage.value ||
    replayingPendingMessages.value
  ) return

  sendingMessage.value = true
  messageError.value = ''
  try {
    const contactId = selected.contactId
    const existingAttempt = pendingTextMessage.value
    const clientMessageId = existingAttempt && existingAttempt.contactId === contactId && existingAttempt.messageContent === content
      ? existingAttempt.clientMessageId
      : createClientMessageId()
    const lastQueuedAt = pendingTextMessages.value.reduce((latest, item) => Math.max(latest, item.createdAt), 0)
    const pending: PendingTextMessage = {
      clientMessageId,
      sessionId: selected.sessionId,
      contactId,
      messageContent: content,
      createdAt: existingAttempt?.clientMessageId === clientMessageId
        ? existingAttempt.createdAt
        : Math.max(Date.now(), lastQueuedAt + 1),
    }
    pendingTextMessage.value = pending
    const accountId = authStore.session?.userId || ''
    let persisted = false
    try {
      persisted = await textMessageCache.savePendingTextMessage(accountId, pending)
    } catch {}

    if (persisted) {
      pendingTextMessages.value = [
        ...pendingTextMessages.value.filter((item) => item.clientMessageId !== clientMessageId),
        pending,
      ].sort((left, right) => left.createdAt - right.createdAt)
      pendingTextMessage.value = null
      messageDraft.value = ''
      void nextTick(resizeMessageComposer)
      if (!browserIsOnline()) return
      await replayPendingTextMessages()
      return
    }

    if (!browserIsOnline()) {
      messageError.value = '网络不可用且本机待发送队列不可用；消息仍保留在输入框中。'
      return
    }

    const message = await chatApi.sendTextMessage(contactId, content, clientMessageId)
    chatStore.appendMessage(message, true)
    messageDraft.value = ''
    void nextTick(resizeMessageComposer)
    pendingTextMessage.value = null
  } catch (error: unknown) {
    messageError.value = error instanceof Error ? error.message : '消息发送失败，请稍后重试'
  } finally {
    sendingMessage.value = false
  }
}

async function stopAiGeneration(message: InitialChatMessage) {
  if (stoppingAiMessageId.value !== null) return
  stoppingAiMessageId.value = message.messageId
  aiActionErrorMessageId.value = null
  aiActionError.value = ''
  try {
    const endedMessage = await chatApi.cancelAiMessage(message.messageId)
    chatStore.receiveAiMessage(endedMessage)
  } catch (error: unknown) {
    aiActionErrorMessageId.value = message.messageId
    aiActionError.value = error instanceof Error ? error.message : '停止 AI 回复失败，请稍后重试'
  } finally {
    stoppingAiMessageId.value = null
  }
}

async function insertEmoji(emoji: string) {
  const composer = messageComposer.value
  if (!composer || composer.disabled) return
  const start = composer.selectionStart ?? messageDraft.value.length
  const end = composer.selectionEnd ?? start
  const next = messageDraft.value.slice(0, start) + emoji + messageDraft.value.slice(end)
  if (next.length > 500) {
    messageError.value = '消息不能超过 500 个字符'
    return
  }
  messageDraft.value = next
  await nextTick()
  composer.focus()
  composer.setSelectionRange(start + emoji.length, start + emoji.length)
  resizeMessageComposer()
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
  await processAttachment(file)
}

async function processAttachment(file: File) {
  fileUploadError.value = ''

  const session = selectedSession.value
  if (!session || session.groupClosed || session.groupAccessRevoked) {
    fileUploadError.value = '当前会话不可发送文件'
    return
  }
  await systemSettingsStore.load().catch(() => systemSettingsStore.settings)
  const validationError = validateChatFile(file, systemSettingsStore.settings)
  if (validationError) {
    fileUploadError.value = validationError
    return
  }
  await sendFileAttachment(session.contactId, file, getChatFileType(file.name))
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function handleFileDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  fileDragDepth += 1
  fileDragActive.value = true
}

function handleFileDragOver(event: DragEvent) {
  if (hasDraggedFiles(event) && event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function handleFileDragLeave(event: DragEvent) {
  if (!hasDraggedFiles(event)) return
  fileDragDepth = Math.max(0, fileDragDepth - 1)
  if (fileDragDepth === 0) fileDragActive.value = false
}

function handleFileDrop(event: DragEvent) {
  fileDragDepth = 0
  fileDragActive.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length === 0) return
  if (files.length > 1) {
    fileUploadError.value = '一次拖放一个文件，请分次发送'
    return
  }
  void processAttachment(files[0]!)
}

async function sendFileAttachment(contactId: string, file: File, fileType: 0 | 1 | 2) {
  if (fileUploading.value) return
  fileUploading.value = true
  fileUploadError.value = ''
  let message: InitialChatMessage | null = null
  try {
    message = await chatApi.sendFileMessage(contactId, file, fileType)
    chatStore.appendMessage(message, true)
    const imageLimitMb = Number(systemSettingsStore.settings.maxImageSize)
    const coverLimitBytes = Number.isSafeInteger(imageLimitMb) && imageLimitMb > 0
      ? imageLimitMb * 1024 * 1024
      : 0
    const cover = fileType === 1 && getChatMediaKind(file.name) === 'video'
      ? await createVideoCover(file, coverLimitBytes)
      : null
    pendingUploadFiles.set(message.messageId, { file, cover })
    await uploadFileForMessage(message.messageId, file, cover)
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

async function uploadFileForMessage(messageId: number, file: File, cover: File | null = null) {
  const onProgress = (progress: number) => chatStore.setFileUploadProgress(messageId, progress)
  if (cover) await chatApi.uploadFile(messageId, file, onProgress, cover)
  else await chatApi.uploadFile(messageId, file, onProgress)
  chatStore.markFileUploadComplete(messageId)
  pendingUploadFiles.delete(messageId)
}

async function retryFileUpload(messageId: number) {
  const pending = pendingUploadFiles.get(messageId)
  if (!pending || fileUploading.value) return
  fileUploading.value = true
  fileUploadError.value = ''
  try {
    await uploadFileForMessage(messageId, pending.file, pending.cover)
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
    const fileName = message.fileName || 'WeTalk-attachment'
    const saveToSelectedLocation = await downloadPreferencesStore.prepareDestination(fileName)
    const blob = await chatApi.downloadFile(message.messageId)
    if (saveToSelectedLocation) {
      await saveToSelectedLocation(blob)
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    fileDownloadErrors.set(message.messageId, error instanceof Error ? error.message : '文件下载失败，请稍后重试')
  } finally {
    downloadingFiles.delete(message.messageId)
  }
}

async function previewMedia(message: InitialChatMessage, event: MouseEvent) {
  if ((message.fileType !== 0 && message.fileType !== 1) || message.status !== 1 || mediaPreviewLoadingId.value !== null) return
  closeMediaPreview(false)
  mediaPreviewTrigger.value = event.currentTarget as HTMLElement
  mediaPreviewErrors.delete(message.messageId)
  mediaPreviewLoadingId.value = message.messageId
  try {
    const mediaKind = getChatMediaKind(message.fileName || '')
    const streamUrl = mediaKind === 'video' || mediaKind === 'audio'
      ? chatApi.streamMediaUrl(message.messageId)
      : null
    if (streamUrl) {
      mediaPreviewUrl.value = streamUrl
      mediaPreviewMessage.value = message
      await focusMediaPreviewCloseButton()
      return
    }
    const blob = await chatApi.downloadFile(message.messageId)
    const mimeType = getChatMediaMimeType(message.fileName || '')
    const previewBlob = mimeType ? new Blob([blob], { type: mimeType }) : blob
    mediaPreviewUrl.value = URL.createObjectURL(previewBlob)
    mediaPreviewMessage.value = message
    await focusMediaPreviewCloseButton()
  } catch {
    mediaPreviewErrors.set(message.messageId, '媒体预览失败，请稍后重试')
  } finally {
    mediaPreviewLoadingId.value = null
  }
}

async function focusMediaPreviewCloseButton() {
  await nextTick()
  mediaPreviewDialog.value?.querySelector<HTMLElement>('button:not([disabled])')?.focus()
}

function trapMediaPreviewFocus(event: KeyboardEvent) {
  const dialog = mediaPreviewDialog.value
  if (event.key !== 'Tab' || !dialog) return
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], audio[controls], [tabindex]:not([tabindex="-1"])',
  ))
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (!dialog.contains(document.activeElement)) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
  } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
    event.preventDefault()
    first.focus()
  }
}

function closeMediaPreview(restoreFocus = true) {
  const trigger = mediaPreviewTrigger.value
  mediaPreviewTrigger.value = null
  if (mediaPreviewUrl.value.startsWith('blob:')) URL.revokeObjectURL(mediaPreviewUrl.value)
  mediaPreviewUrl.value = ''
  mediaPreviewMessage.value = null
  if (restoreFocus && trigger) {
    void nextTick().then(() => {
      if (trigger.isConnected) trigger.focus()
    })
  }
}

function handleMediaPlaybackError() {
  if (mediaPreviewMessage.value) {
    mediaPreviewErrors.set(mediaPreviewMessage.value.messageId, '媒体流无法播放，请检查登录状态或浏览器格式支持')
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

function isAiMessage(message: InitialChatMessage) {
  return message.messageType === 14 || message.messageType === 15 || message.messageType === 16
}

async function signOut() {
  closeProfileMenu()
  signingOut.value = true
  try {
    await authApi.logout()
  } catch {
    // Clear the browser session even if the server is unreachable.
  } finally {
    chatStore.clear()
    systemSettingsStore.reset()
    downloadPreferencesStore.reset()
    authStore.clearSession()
    signingOut.value = false
    await router.replace({ name: 'login' })
  }
}
</script>

<template>
  <main
    ref="chatShell"
    class="chat-shell"
    :class="{ 'is-sidebar-collapsed': sidebarCollapsed }"
    data-testid="chat-shell"
    @click="closeProfileMenu"
  >
    <button
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航菜单"
      @click="closeMobileNavigation()"
    ></button>

    <aside
      id="chat-navigation"
      ref="chatNavigation"
      class="chat-sidebar"
      aria-label="聊天导航"
      :class="{ 'is-open': sidebarOpen }"
      @keydown.esc.stop.prevent="closeMobileNavigation()"
      @keydown.tab="trapMobileNavigationFocus"
    >
      <div class="sidebar-top">
        <RouterLink class="sidebar-brand" :to="{ name: 'chat' }" aria-label="WeTalk">
          <span class="brand-mark">W</span>
          <span class="sidebar-brand-name">WeTalk</span>
        </RouterLink>
        <div class="sidebar-top-actions">
          <button
            v-if="!sidebarCollapsed"
            ref="messageSearchTrigger"
            class="icon-button sidebar-header-search"
            data-testid="toggle-message-search"
            type="button"
            :aria-label="messageSearchOpen ? '关闭消息搜索' : '搜索本会话消息'"
            :title="messageSearchOpen ? '关闭消息搜索' : '搜索本会话消息'"
            :aria-pressed="messageSearchOpen"
            :class="{ 'is-active': messageSearchOpen }"
            aria-controls="message-search-panel"
            :disabled="!selectedSession"
            @click="toggleMessageSearch"
          >
            <svg class="sidebar-control-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.5"></circle>
              <path d="m15.6 15.6 4.1 4.1"></path>
            </svg>
          </button>
          <button
            v-if="!sidebarCollapsed"
            ref="desktopSidebarCollapseButton"
            class="icon-button desktop-sidebar-collapse"
            data-testid="collapse-sidebar"
            type="button"
            aria-label="收起侧边栏"
            title="收起侧边栏"
            aria-controls="chat-navigation"
            aria-expanded="true"
            @click="collapseDesktopSidebar"
          >
            <svg class="sidebar-control-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.75" y="4.5" width="16.5" height="15" rx="2.5"></rect>
              <path d="M9 4.75v14.5"></path>
            </svg>
          </button>
          <button
            v-else
            ref="desktopSidebarExpandButton"
            class="icon-button desktop-sidebar-expand"
            data-testid="expand-sidebar"
            type="button"
            aria-label="展开侧边栏"
            title="展开侧边栏"
            aria-controls="chat-navigation"
            aria-expanded="false"
            @click="expandDesktopSidebar"
          >
            <svg class="sidebar-control-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.75" y="4.5" width="16.5" height="15" rx="2.5"></rect>
              <path d="M9 4.75v14.5"></path>
              <path d="m12.5 9 3 3-3 3"></path>
            </svg>
          </button>
          <button
            ref="mobileMenuCloseButton"
            class="icon-button mobile-menu-close"
            type="button"
            aria-label="关闭菜单"
            @click="closeMobileNavigation()"
          >
            ×
          </button>
        </div>
      </div>

      <button class="new-chat-button" type="button" disabled aria-label="新聊天" title="新聊天">
        <span aria-hidden="true">＋</span>
        <span class="sidebar-action-label">新聊天</span>
      </button>
      <button
        v-if="sidebarCollapsed"
        class="sidebar-search-button"
        ref="messageSearchTrigger"
        data-testid="toggle-message-search"
        type="button"
        :aria-label="messageSearchOpen ? '关闭消息搜索' : '搜索本会话消息'"
        :title="messageSearchOpen ? '关闭消息搜索' : '搜索本会话消息'"
        :aria-pressed="messageSearchOpen"
        :class="{ 'is-active': messageSearchOpen }"
        aria-controls="message-search-panel"
        :disabled="!selectedSession"
        @click="toggleMessageSearch"
      >
        <svg class="sidebar-control-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="10.8" cy="10.8" r="6.5"></circle>
          <path d="m15.6 15.6 4.1 4.1"></path>
        </svg>
      </button>
      <button
        class="new-chat-button contact-add-button"
        data-testid="open-contact-search"
        type="button"
        aria-label="添加联系人"
        title="添加联系人"
        @click="openContactSearch"
      >
        <span aria-hidden="true">＋</span>
        <span class="sidebar-action-label">添加联系人</span>
      </button>
      <button
        class="new-chat-button contact-directory-button"
        data-testid="open-contact-directory"
        type="button"
        aria-label="联系人"
        title="联系人"
        @click="openContactDirectory"
      >
        <span aria-hidden="true">☷</span>
        <span class="sidebar-action-label">联系人</span>
      </button>
      <button
        class="new-chat-button group-directory-button"
        data-testid="open-group-directory"
        type="button"
        aria-label="群聊"
        title="群聊"
        @click="openGroupDirectory"
      >
        <span aria-hidden="true">▦</span>
        <span class="sidebar-action-label">群聊</span>
      </button>

      <section class="history-section" aria-label="聊天记录">
        <p class="sidebar-label">最近的聊天</p>
        <p v-if="!chatStore.initialized" class="history-empty">
          {{ chatStore.connectionError || connectionLabel }}
        </p>
        <p v-else-if="visibleSessions.length === 0" class="history-empty">还没有聊天会话</p>
        <div v-else class="chat-session-list">
          <button
            v-for="session in visibleSessions"
            :key="session.sessionId"
            class="chat-session-entry"
            :data-testid="`chat-session-${session.sessionId}`"
            :class="{ 'is-active': session.sessionId === selectedSessionId }"
            type="button"
            :aria-label="`${session.contactName || session.contactId}，${session.lastMessage || '开始一段新对话'}`"
            :title="session.contactName || session.contactId"
            @click="selectChatSession(session.sessionId)"
          >
            <AvatarThumbnail
              class="session-avatar"
              :file-id="session.contactId"
              :fallback="(session.contactName || 'W').slice(0, 1)"
            />
            <span class="session-entry-copy">
              <strong>{{ conversationPreferences.pinned.includes(session.sessionId) ? '↑ ' : '' }}{{ session.contactName || session.contactId }}</strong>
              <small>{{ session.lastMessage || '开始一段新对话' }}</small>
            </span>
            <span
              v-if="session.noReadCount"
              class="session-unread-badge"
              :data-testid="`session-unread-${session.sessionId}`"
              :aria-label="`${session.noReadCount} 条未读消息`"
            >{{ session.noReadCount > 99 ? '99+' : session.noReadCount }}</span>
          </button>
        </div>
        <button
          v-if="removedSessions.length" class="pending-apply-count" type="button"
          data-testid="toggle-removed-conversations" :aria-expanded="showRemovedConversations"
          :aria-label="`已移除的会话，${removedSessions.length} 个`"
          @click="showRemovedConversations = !showRemovedConversations; sidebarCollapsed = false"
        ><span class="sidebar-action-icon" aria-hidden="true">↶</span><span class="sidebar-action-label">已移除（{{ removedSessions.length }}）</span></button>
        <div v-if="showRemovedConversations && removedSessions.length" class="chat-session-list" aria-label="已移除的会话">
          <small>仅从本浏览器列表移除，消息和联系人保留；收到新消息会重新显示。</small>
          <button v-for="session in removedSessions" :key="session.sessionId" class="chat-session-entry" type="button"
            :data-testid="`restore-conversation-${session.sessionId}`" @click="selectChatSession(session.sessionId)"
          >恢复 {{ session.contactName || session.contactId }}</button>
        </div>
        <p v-if="conversationPreferences.storageError" class="contact-error" role="status">{{ conversationPreferences.storageError }}</p>
        <button
          v-if="chatStore.initialized"
          class="pending-apply-count"
          data-testid="open-contact-applications"
          type="button"
          aria-haspopup="dialog"
          :aria-label="chatStore.applyCount > 0 ? '好友申请，' + chatStore.applyCount + ' 条待处理' : '好友申请'"
          @click="openContactApplications"
        >
          <span class="sidebar-action-icon" aria-hidden="true">▤</span>
          <span class="sidebar-action-label">好友申请</span>
          <span v-if="chatStore.applyCount > 0" class="pending-apply-badge">
            {{ chatStore.applyCount > 99 ? '99+' : chatStore.applyCount }}
          </span>
        </button>
      </section>

      <div class="sidebar-bottom">
        <div class="profile-menu-anchor" @click.stop @focusout="handleProfileMenuFocusOut">
          <button
            class="profile-trigger"
            data-testid="profile-menu-trigger"
            ref="profileTrigger"
            type="button"
            :aria-label="`账号菜单，${displayName}`"
            :title="displayName"
            aria-haspopup="menu"
            aria-controls="profile-actions-menu"
            :aria-expanded="profileMenuOpen"
            @click="toggleProfileMenu"
          >
            <AvatarThumbnail
              class="profile-avatar"
              :file-id="profile?.userId || authStore.session?.userId"
              :fallback="avatarInitial"
              :refresh-key="profileAvatarVersion"
            />
            <span class="profile-copy">
              <strong>{{ displayName }}</strong>
              <span>{{ profile?.email || authStore.session?.email }}</span>
            </span>
          </button>
          <div
            v-if="profileMenuOpen"
            id="profile-actions-menu"
            ref="profileMenu"
            class="profile-actions-menu"
            role="menu"
            aria-label="账号菜单"
            data-testid="profile-actions-menu"
            @keydown="handleProfileMenuKeydown"
          >
            <div class="profile-menu-account">
              <AvatarThumbnail
                class="profile-menu-avatar"
                :file-id="profile?.userId || authStore.session?.userId"
                :fallback="avatarInitial"
                :refresh-key="profileAvatarVersion"
              />
              <span class="profile-menu-account-copy">
                <strong>{{ displayName }}</strong>
                <small>{{ profile?.email || authStore.session?.email }}</small>
              </span>
            </div>
            <div class="profile-menu-divider" aria-hidden="true"></div>
            <button
              ref="profileMenuFirstAction"
              class="profile-menu-item"
              data-testid="open-profile"
              role="menuitem"
              type="button"
              @click="openProfileFromMenu"
            >个人资料与安全</button>
            <template v-if="authStore.session?.admin">
              <div class="profile-menu-divider" aria-hidden="true"></div>
              <small class="profile-menu-section-label">管理</small>
              <button class="profile-menu-item" data-testid="open-admin-users" role="menuitem" type="button" @click="openAdminUsers">管理用户</button>
              <button class="profile-menu-item" data-testid="open-admin-groups" role="menuitem" type="button" @click="openAdminGroups">管理群聊</button>
              <button class="profile-menu-item" data-testid="open-admin-settings" role="menuitem" type="button" @click="openAdminSettings">系统设置</button>
              <button class="profile-menu-item" data-testid="open-admin-beauty-accounts" role="menuitem" type="button" @click="openAdminBeautyAccounts">靓号管理</button>
            </template>
            <div class="profile-menu-divider" aria-hidden="true"></div>
            <button
              class="profile-menu-item profile-menu-signout"
              data-testid="signout"
              role="menuitem"
              type="button"
              :disabled="signingOut"
              @click="signOut"
            >退出登录</button>
          </div>
        </div>
      </div>
    </aside>

    <section
      class="chat-main"
      data-testid="chat-main"
      :class="{ 'is-file-dragging': fileDragActive }"
      @dragenter.prevent="handleFileDragEnter"
      @dragover.prevent="handleFileDragOver"
      @dragleave.prevent="handleFileDragLeave"
      @drop.prevent="handleFileDrop"
    >
      <div v-if="fileDragActive" class="file-drop-overlay" data-testid="file-drop-overlay">
        松开鼠标以上传普通文件
      </div>
      <header class="chat-topbar">
        <button
          class="icon-button mobile-menu-open"
          type="button"
          aria-label="打开导航菜单"
          aria-controls="chat-navigation"
          :aria-expanded="sidebarOpen"
          @click="openMobileNavigation($event)"
        >
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

      <div v-if="selectedSession" class="conversation-actions" aria-label="当前会话操作">
        <button class="message-search-clear" type="button" data-testid="pin-conversation"
          :aria-pressed="conversationPreferences.pinned.includes(selectedSession.sessionId)"
          @click="conversationPreferences.togglePin(selectedSession.sessionId)"
        >{{ conversationPreferences.pinned.includes(selectedSession.sessionId) ? '取消置顶' : '置顶会话' }}</button>
        <button class="message-search-clear" type="button" data-testid="remove-conversation"
          title="仅从本浏览器列表移除，保留联系人和历史消息"
          @click="conversationPreferences.hide(selectedSession)"
        >从列表移除</button>
      </div>

      <section
        v-if="webReleaseNotice && !webReleaseNoticeDismissed"
        class="web-release-notice"
        data-testid="web-release-notice"
        aria-label="WeTalk 更新说明"
        role="status"
      >
        <div class="web-release-copy">
          <strong>WeTalk 新版本 {{ webReleaseNotice.version }}</strong>
          <ul v-if="webReleaseNotice.updateList.length" class="web-release-list">
            <li v-for="(item, index) in webReleaseNotice.updateList" :key="`${webReleaseNotice.id}-${index}`">{{ item }}</li>
          </ul>
          <a
            v-if="webReleaseNotice.fileType === 1 && webReleaseLink"
            class="web-release-link"
            :href="webReleaseLink"
            target="_blank"
            rel="noopener noreferrer"
          >查看外部更新信息</a>
          <small v-else-if="webReleaseNotice.fileType === 0">
            此版本记录包含桌面安装包；网页版只展示发布说明，不需要安装桌面程序。
          </small>
        </div>
        <button
          class="web-release-dismiss"
          data-testid="dismiss-web-release"
          type="button"
          aria-label="关闭版本提示"
          @click="dismissWebReleaseNotice"
        >×</button>
      </section>

      <section
        v-if="messageSearchOpen && selectedSession"
        id="message-search-panel"
        class="message-search-panel"
        data-testid="message-search-panel"
        aria-label="搜索本会话消息"
        @keydown.esc.stop.prevent="closeMessageSearch"
      >
        <div class="message-search-input-row">
          <input
            ref="messageSearchInput"
            v-model="messageSearchQuery"
            data-testid="message-search-input"
            type="search"
            autocomplete="off"
            placeholder="搜索本会话消息、文件名或发送人"
            aria-label="搜索本会话消息、文件名或发送人"
          />
          <button
            v-if="messageSearchQuery"
            class="message-search-clear"
            data-testid="clear-message-search"
            type="button"
            @click="messageSearchQuery = ''"
          >清除</button>
          <button
            v-if="searchJumpMessageId !== null"
            class="message-search-clear"
            data-testid="return-to-latest-message"
            type="button"
            @click="returnToLatestMessages"
          >最新消息</button>
        </div>
        <p class="message-search-hint" role="status" data-testid="search-history-status">
          <template v-if="fullHistorySearchStatus === 'searching'">
            正在搜索全部历史：已检查 {{ fullHistorySearchScanned }} / {{ fullHistorySearchTotal ?? '…' }} 条，找到 {{ messageSearchResults.length }} 条匹配记录。
          </template>
          <template v-else-if="fullHistorySearchStatus === 'complete'">
            已搜索完整个会话历史，显示 {{ messageSearchResults.length }} 条匹配记录（最多 50 条）。
          </template>
          <template v-else-if="messageSearchQuery.trim()">
            当前已加载消息中有 {{ messageSearchResults.length }} 条匹配记录（最多 50 条）；可以继续搜索全部历史。
          </template>
          <template v-else>搜索当前已加载的消息，或搜索完整个会话的服务端历史。</template>
        </p>
        <p v-if="fullHistorySearchError" class="message-search-error" role="alert">{{ fullHistorySearchError }}</p>
        <p v-if="messageSearchQuery.trim() && messageSearchResults.length === 0 && fullHistorySearchStatus !== 'searching'" class="message-search-empty">
          当前已加载记录中没有匹配项；可以搜索全部历史消息。
        </p>
        <div v-if="messageSearchResults.length > 0" class="message-search-results" data-testid="message-search-results">
          <button
            v-for="message in messageSearchResults"
            :key="message.messageId"
            class="message-search-result"
            :data-testid="`message-search-result-${message.messageId}`"
            type="button"
            @click="jumpToSearchResult(message.messageId)"
          >
            <span class="message-search-result-copy">
              <strong>{{ message.sendUserId === authStore.session?.userId ? '我' : message.sendUserNickName || '消息' }}</strong>
              <small>{{ message.fileName || message.messageContent }}</small>
            </span>
            <time>{{ formatMessageTime(message.sendTime) }}</time>
          </button>
        </div>
        <button
          v-if="messageSearchQuery.trim() && fullHistorySearchStatus !== 'searching' && fullHistorySearchStatus !== 'complete'"
          class="message-search-older"
          data-testid="search-entire-history"
          type="button"
          @click="searchEntireHistory"
        >{{ fullHistorySearchStatus === 'cancelled' || fullHistorySearchStatus === 'error' ? '继续搜索全部历史' : '搜索全部历史' }}</button>
        <button
          v-if="messageSearchQuery.trim() && fullHistorySearchStatus === 'searching'"
          class="message-search-older"
          data-testid="cancel-history-search"
          type="button"
          @click="cancelFullHistorySearch"
        >停止搜索</button>
        <button
          v-if="currentHistory?.hasMore"
          class="message-search-older"
          data-testid="search-older-messages"
          type="button"
          :disabled="olderMessagesLoading"
          @click="loadOlderMessages"
        >{{ olderMessagesLoading ? '正在加载…' : '将更早消息载入聊天' }}</button>
      </section>

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
              :class="{ 'is-mine': (message.messageType === 2 || message.messageType === 5) && message.sendUserId === authStore.session?.userId, 'is-system': ![2, 5, 14, 15, 16].includes(message.messageType), 'is-ai': isAiMessage(message) }"
              :data-testid="`message-${message.messageId}`"
            >
              <div class="message-bubble">
                <strong
                  v-if="((message.messageType === 2 || message.messageType === 5) && message.sendUserId !== authStore.session?.userId) || isAiMessage(message)"
                  class="message-sender"
                >
                  {{ message.sendUserNickName }}
                </strong>
                <div v-if="message.messageType === 5" class="file-message-card" data-testid="file-attachment">
                  <div class="file-message-main">
                    <AvatarThumbnail
                      v-if="message.fileType === 1 && message.status === 1 && getChatMediaKind(message.fileName || '') === 'video'"
                      class="media-message-thumbnail"
                      :file-id="message.messageId"
                      :show-cover="true"
                      fallback="▶"
                      :test-id="`media-thumbnail-${message.messageId}`"
                    />
                    <span v-else class="file-message-mark" aria-hidden="true">FILE</span>
                    <span class="file-message-copy">
                      <strong>{{ message.fileName || '附件' }}</strong>
                      <small>{{ formatFileSize(message.fileSize) }}</small>
                    </span>
                  </div>
                  <div class="file-message-status">
                    <span>{{ fileUploadStatus(message) }}</span>
                    <button
                      v-if="message.fileType === 0 || message.fileType === 1"
                      class="file-preview-button"
                      data-testid="preview-media"
                      type="button"
                      :disabled="message.status !== 1 || mediaPreviewLoadingId !== null"
                      @click="previewMedia(message, $event)"
                    >{{ mediaPreviewLoadingId === message.messageId ? '加载中…' : message.fileType === 0 ? '预览图片' : '播放' }}</button>
                    <button
                      class="file-download-button"
                      data-testid="download-file"
                      type="button"
                      :disabled="message.status !== 1 || downloadingFiles.has(message.messageId) || downloadPreferencesStore.loading || Boolean(selectedSession?.groupClosed || selectedSession?.groupAccessRevoked)"
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
                  <small v-if="mediaPreviewErrors.has(message.messageId)" class="file-download-error" role="alert">
                    {{ mediaPreviewErrors.get(message.messageId) }}
                  </small>
                  <small v-if="fileDownloadErrors.has(message.messageId)" class="file-download-error" role="alert">
                    {{ fileDownloadErrors.get(message.messageId) }}
                  </small>
                </div>
                <p v-else-if="isAiMessage(message)" class="ai-message-content" aria-live="polite">
                  <span v-if="!message.messageContent && message.aiStatus === 'waiting'" data-testid="ai-waiting">WeTalk 正在思考…</span>
                  <span v-else-if="!message.messageContent && message.aiStatus === 'interrupted'" data-testid="ai-interrupted">
                    AI 回复中断，请重新发送问题。
                  </span>
                  <span v-else-if="!message.messageContent && message.aiStatus === 'cancelled'" data-testid="ai-cancelled">已停止生成。</span>
                  <span v-else-if="!message.messageContent && message.aiStatus === 'failed'" data-testid="ai-failed">AI 暂时无法完成回复，请重试。</span>
                  <template v-else>{{ message.messageContent }}</template>
                  <span v-if="message.aiStatus === 'streaming'" class="ai-stream-cursor" aria-hidden="true">▍</span>
                  <small v-if="message.aiStatus === 'interrupted' && message.messageContent" class="ai-interrupted-note">
                    回复中断，请在输入框重新发送问题。
                  </small>
                  <small v-if="message.aiStatus === 'cancelled' && message.messageContent" class="ai-interrupted-note">已停止生成。</small>
                  <small v-if="message.aiStatus === 'failed' && message.messageContent" class="ai-interrupted-note">AI 生成失败，请重试。</small>
                </p>
                <p v-else>{{ message.messageContent }}</p>
                <button
                  v-if="isAiMessage(message) && ['waiting', 'streaming', 'interrupted'].includes(message.aiStatus || '')"
                  class="ai-stop-button"
                  :data-testid="`cancel-ai-${message.messageId}`"
                  type="button"
                  :disabled="stoppingAiMessageId !== null"
                  @click="stopAiGeneration(message)"
                >{{ stoppingAiMessageId === message.messageId ? '正在停止…' : '停止生成' }}</button>
                <small v-if="aiActionErrorMessageId === message.messageId && aiActionError" class="ai-interrupted-note" role="alert">
                  {{ aiActionError }}
                </small>
                <div class="message-footer">
                  <time>{{ formatMessageTime(message.sendTime) }}</time>
                  <span
                    v-if="message.messageType === 2 && message.sendUserId === authStore.session?.userId"
                    class="message-send-status"
                    :aria-label="selectedSession?.contactType === 0 && (selectedSession.peerReadMessageId || 0) >= message.messageId ? '已读' : '服务端已接收并保存'"
                    data-testid="message-send-status"
                  >
                    {{ selectedSession?.contactType === 0 && (selectedSession.peerReadMessageId || 0) >= message.messageId ? '已读' : '已发送' }}
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

      <section
        v-if="pendingTextMessages.length"
        class="pending-text-queue"
        data-testid="pending-text-queue"
        aria-label="待发送文字消息"
      >
        <header class="pending-text-queue-header">
          <strong>待发送消息（{{ pendingTextMessages.length }}）</strong>
          <span role="status">{{ replayingPendingMessages ? '正在按顺序发送…' : '消息已保存在本机，恢复联网后会自动重试。' }}</span>
        </header>
        <div
          v-for="pending in pendingTextMessages"
          :key="pending.clientMessageId"
          class="pending-text-queue-item"
          :data-testid="`pending-text-${pending.clientMessageId}`"
        >
          <div class="pending-text-queue-copy">
            <strong>{{ pendingContactName(pending) }}</strong>
            <span>{{ pending.messageContent }}</span>
          </div>
          <button
            class="message-retry-button"
            type="button"
            :disabled="replayingPendingMessages || !browserIsOnline()"
            @click="retryPendingMessages"
          >重试</button>
          <button
            class="pending-text-remove-button"
            type="button"
            :disabled="replayingPendingMessages"
            :aria-label="`从本机队列移除发往 ${pendingContactName(pending)} 的消息`"
            @click="discardPendingTextMessage(pending.clientMessageId)"
          >移除</button>
        </div>
        <p v-if="pendingQueueError" class="composer-error" data-testid="pending-queue-error" role="alert">
          {{ pendingQueueError }}
        </p>
        <small>“移除”只删除本机重试记录；如果服务器已接收消息，不会撤回。</small>
      </section>

      <div v-if="messageError" class="message-error-row">
        <p class="composer-error" role="alert">{{ messageError }}</p>
        <button
          v-if="messageDraft.trim() && selectedSession && !selectedSession.groupClosed && !selectedSession.groupAccessRevoked"
          class="message-retry-button"
          data-testid="retry-message-send"
          type="button"
          :disabled="sendingMessage"
          @click="sendTextMessage"
        >{{ sendingMessage ? '正在重试…' : '重试发送' }}</button>
      </div>
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
        <EmojiPicker :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || sendingMessage || replayingPendingMessages" @select="insertEmoji" />
        <textarea
          v-model="messageDraft"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || sendingMessage || replayingPendingMessages"
          rows="1"
          maxlength="500"
          placeholder="发送文字消息，Enter 发送，Shift+Enter 换行"
          aria-label="消息内容"
          ref="messageComposer"
          data-testid="message-composer"
          @input="resizeMessageComposer"
          @keydown.enter.exact.prevent="sendTextMessage"
        ></textarea>
        <button
          class="composer-send"
          type="button"
          :disabled="!selectedSession || selectedSession.groupClosed || selectedSession.groupAccessRevoked || !messageDraft.trim() || sendingMessage || replayingPendingMessages"
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

    <div
      v-if="mediaPreviewMessage && mediaPreviewUrl"
      class="media-preview-overlay"
      data-testid="media-preview-overlay"
      @click.self="closeMediaPreview()"
    >
      <section
        class="media-preview-dialog"
        ref="mediaPreviewDialog"
        data-testid="media-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="媒体预览"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeMediaPreview()"
        @keydown.tab="trapMediaPreviewFocus"
      >
        <header>
          <strong>{{ mediaPreviewMessage.fileName || '媒体文件' }}</strong>
          <button class="icon-button" type="button" aria-label="关闭媒体预览" @click="closeMediaPreview()">×</button>
        </header>
        <img
          v-if="getChatMediaKind(mediaPreviewMessage.fileName || '') === 'image'"
          :src="mediaPreviewUrl"
          :alt="mediaPreviewMessage.fileName || '聊天图片'"
        />
        <video
          v-else-if="getChatMediaKind(mediaPreviewMessage.fileName || '') === 'video'"
          :src="mediaPreviewUrl"
          controls
          playsinline
          preload="metadata"
          @error="handleMediaPlaybackError"
        ></video>
        <audio v-else :src="mediaPreviewUrl" controls preload="metadata" @error="handleMediaPlaybackError"></audio>
        <p v-if="mediaPreviewErrors.has(mediaPreviewMessage.messageId)" class="file-download-error" role="alert">
          {{ mediaPreviewErrors.get(mediaPreviewMessage.messageId) }}
        </p>
      </section>
    </div>

    <ContactDirectoryDialog
      v-if="contactDirectoryOpen"
      :return-focus-target="sidebarDialogReturnFocusTarget"
      @close="closeContactDirectoryDialog"
      @contacts-changed="refreshChatSession"
    />

    <GroupDirectoryDialog
      v-if="groupDirectoryOpen"
      :current-user-id="authStore.session?.userId || ''"
      :refresh-key="groupDirectoryRefreshKey"
      :return-focus-target="sidebarDialogReturnFocusTarget"
      @close="closeGroupDirectoryDialog"
    />

    <ContactApplicationsDialog
      v-if="contactApplicationsOpen"
      :return-focus-target="sidebarDialogReturnFocusTarget"
      @close="closeContactApplicationsDialog"
      @application-handled="refreshChatSession"
    />

    <ContactSearchDialog
      v-if="contactSearchOpen"
      :current-user-id="authStore.session?.userId || ''"
      :display-name="displayName"
      :return-focus-target="sidebarDialogReturnFocusTarget"
      @close="closeContactSearchDialog"
      @contact-added="refreshChatSession"
    />

    <div v-if="profileOpen" class="profile-overlay" data-testid="profile-overlay" @click.self="closeProfile">
      <section
        class="profile-dialog"
        ref="profileDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        tabindex="-1"
        @keydown.esc.stop.prevent="closeProfile"
        @keydown.tab="trapProfileFocus"
      >
        <div class="profile-dialog-toolbar" data-testid="profile-dialog-toolbar">
          <header class="profile-dialog-header">
            <div>
              <p class="eyebrow">账号</p>
              <h2 id="profile-title">个人资料与安全</h2>
            </div>
            <button ref="profileCloseButton" class="icon-button profile-close" type="button" aria-label="关闭个人资料" @click="closeProfile">
              ×
            </button>
          </header>
          <nav class="profile-section-nav" aria-label="账号设置分区" data-testid="profile-section-nav">
            <button
              v-for="section in profileSections"
              :key="section.id"
              type="button"
              :aria-controls="`profile-section-${section.id}`"
              :aria-pressed="activeProfileSection === section.id"
              :data-testid="`profile-section-tab-${section.id}`"
              @click="selectProfileSection(section.id)"
            >{{ section.label }}</button>
          </nav>
        </div>

        <div
          ref="profileContent"
          class="profile-dialog-content"
          data-testid="profile-dialog-content"
          @scroll.passive="updateActiveProfileSection"
        >
          <section id="profile-section-account" class="profile-settings-section" aria-labelledby="profile-section-account-title">
            <h3 id="profile-section-account-title" class="profile-settings-section-title">个人资料</h3>
            <p v-if="profileLoading" class="profile-status" role="status">正在读取个人资料…</p>
            <p v-else-if="profileError" class="profile-load-error" role="alert">{{ profileError }}</p>

        <AvatarThumbnail
          class="profile-cover-thumbnail"
          :file-id="profile?.userId || authStore.session?.userId"
          :show-cover="true"
          :refresh-key="profileAvatarVersion"
          test-id="profile-cover"
        />

        <div v-if="profile" class="profile-identity-row">
          <AvatarThumbnail
            class="contact-profile-avatar"
            :file-id="profile.userId"
            :fallback="(profile.nickName || displayName).slice(0, 1)"
            :refresh-key="profileAvatarVersion"
            test-id="profile-avatar-preview"
          />
          <div>
            <strong>{{ profile.nickName || displayName }}</strong>
            <p>{{ profile.personalSignature || '还没有填写个性签名' }}</p>
          </div>
        </div>

        <p v-if="profileSaveNotice" class="contact-notice" role="status">{{ profileSaveNotice }}</p>
        <p v-if="profileSaveError" class="contact-error" role="alert">{{ profileSaveError }}</p>

        <button
          v-if="profile && !profileEditOpen"
          class="profile-edit-toggle"
          data-testid="edit-profile"
          type="button"
          @click="openProfileEditor"
        >编辑个人资料</button>

        <form v-if="profileEditOpen" class="profile-edit-form" data-testid="profile-edit-form" @submit.prevent="saveProfile">
          <label for="profile-edit-name">昵称</label>
          <input id="profile-edit-name" v-model.trim="profileForm.nickName" data-testid="profile-edit-name" maxlength="40" />
          <label for="profile-edit-sex">性别</label>
          <select id="profile-edit-sex" v-model="profileForm.sex" data-testid="profile-edit-sex">
            <option value="">不修改</option>
            <option value="0">男</option>
            <option value="1">女</option>
          </select>
          <label for="profile-edit-join-type">添加好友方式</label>
          <select id="profile-edit-join-type" v-model.number="profileForm.joinType" data-testid="profile-edit-join-type">
            <option :value="1">需要我同意</option>
            <option :value="0">允许直接添加</option>
          </select>
          <label for="profile-edit-signature">个性签名</label>
          <textarea
            id="profile-edit-signature"
            v-model="profileForm.personalSignature"
            data-testid="profile-edit-signature"
            maxlength="64"
            rows="3"
          ></textarea>
          <label for="profile-edit-area-name">地区名称</label>
          <input id="profile-edit-area-name" v-model.trim="profileForm.areaName" data-testid="profile-edit-area-name" maxlength="64" />
          <label for="profile-edit-area-code">地区编号</label>
          <input id="profile-edit-area-code" v-model.trim="profileForm.areaCode" data-testid="profile-edit-area-code" maxlength="64" />
          <label for="profile-avatar-file">头像图片</label>
          <input
            id="profile-avatar-file"
            ref="profileAvatarInput"
            data-testid="profile-avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
            @change="selectProfileImage($event, 'avatar')"
          />
          <small v-if="profileAvatarFile">已选择：{{ profileAvatarFile.name }}</small>
          <label for="profile-cover-file">封面图片（可选）</label>
          <input
            id="profile-cover-file"
            ref="profileCoverInput"
            data-testid="profile-cover-file"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/bmp,image/webp"
            @change="selectProfileImage($event, 'cover')"
          />
          <small v-if="profileCoverFile">已选择：{{ profileCoverFile.name }}</small>
          <div class="profile-edit-actions">
            <button class="password-submit" data-testid="save-profile" type="submit" :disabled="profileSaving">
              {{ profileSaving ? '正在保存…' : '保存资料' }}
            </button>
            <button class="message-search-clear" data-testid="cancel-profile-edit" type="button" :disabled="profileSaving" @click="cancelProfileEdit">
              取消
            </button>
          </div>
        </form>

        <dl v-if="!profileEditOpen" class="profile-details">
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
          <div>
            <dt>添加好友方式</dt>
            <dd>{{ profile?.joinType === 0 ? '允许直接添加' : '需要我同意' }}</dd>
          </div>
        </dl>

          </section>

          <section id="profile-section-preferences" class="profile-settings-section" aria-labelledby="profile-section-preferences-title">
            <h3 id="profile-section-preferences-title" class="profile-settings-section-title">偏好设置</h3>

        <button class="about-link-button" data-testid="open-about" type="button" @click="openAbout">
          关于 WeTalk
        </button>

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

        <section class="download-preference-controls" data-testid="download-preferences">
          <div>
            <h3>文件下载位置</h3>
            <p>默认位置由浏览器管理；支持的浏览器可每次选择位置或保存到你授权的文件夹。</p>
          </div>
          <label for="download-location-mode">下载方式</label>
          <select
            id="download-location-mode"
            data-testid="download-location-mode"
            :value="downloadPreferencesStore.mode"
            :disabled="downloadPreferencesStore.loading || !downloadPreferencesStore.loaded"
            @change="changeDownloadMode"
          >
            <option value="browser">使用浏览器默认下载位置</option>
            <option value="ask" :disabled="!downloadPreferencesStore.supportsSavePicker">每次下载时选择位置</option>
            <option value="folder" :disabled="!downloadPreferencesStore.supportsDirectoryPicker || !downloadPreferencesStore.directoryName">保存到所选文件夹</option>
          </select>
          <div class="download-preference-actions">
            <button
              class="message-search-clear"
              data-testid="choose-download-folder"
              type="button"
              :disabled="downloadPreferencesStore.loading || !downloadPreferencesStore.supportsDirectoryPicker"
              @click="chooseDownloadFolder"
            >选择文件夹</button>
            <button
              v-if="downloadPreferencesStore.directoryName"
              class="message-search-clear"
              data-testid="clear-download-folder"
              type="button"
              :disabled="downloadPreferencesStore.loading"
              @click="clearDownloadFolder"
            >清除所选文件夹</button>
          </div>
          <p v-if="downloadPreferencesStore.directoryName" class="download-preference-folder">
            已授权文件夹：{{ downloadPreferencesStore.directoryName }}
          </p>
          <p v-if="!downloadPreferencesStore.supportsDirectoryPicker" class="download-preference-note">
            此浏览器不支持网页选择文件夹；仍可使用浏览器默认下载位置。
          </p>
          <p v-if="downloadPreferencesStore.storageError || downloadPreferenceError" class="contact-error" role="alert">
            {{ downloadPreferenceError || downloadPreferencesStore.storageError }}
          </p>
          <p v-if="downloadPreferenceNotice" class="contact-notice" role="status">{{ downloadPreferenceNotice }}</p>
        </section>

          </section>

          <section id="profile-section-sessions" class="profile-settings-section" aria-labelledby="profile-section-sessions-title">
            <h3 id="profile-section-sessions-title" class="profile-settings-section-title">登录设备</h3>

        <section class="session-management" aria-labelledby="session-management-title" data-testid="session-management">
          <header class="session-management-header">
            <div>
              <h3 id="session-management-title">登录中的设备</h3>
              <p>查看账号当前登录位置；退出设备后，该设备的网页和实时连接都会失效。</p>
            </div>
            <button
              ref="sessionRefreshButton"
              class="message-search-clear"
              data-testid="refresh-sessions"
              type="button"
              :disabled="sessionsLoading || Boolean(sessionActionId)"
              @click="loadSessions"
            >刷新</button>
          </header>
          <p class="profile-status" data-testid="session-policy-note">账号可同时保持一台 WeTalk 客户端和一个浏览器登录。同类型设备再次登录时，旧会话会立即退出。</p>
          <p v-if="sessionsLoading" class="profile-status" role="status">正在读取登录设备…</p>
          <p v-if="sessionsError" class="contact-error" role="alert">{{ sessionsError }}</p>
          <p v-if="sessionsNotice" class="contact-notice" role="status">{{ sessionsNotice }}</p>
          <p v-if="!sessionsLoading && !sessionsError && userSessions.length === 0" class="profile-status">
            暂无有效登录设备记录。
          </p>
          <ul v-if="userSessions.length" class="session-list" aria-label="当前登录设备">
            <li
              v-for="session in userSessions"
              :key="session.sessionId"
              class="session-row"
              :data-testid="`session-row-${session.sessionId}`"
            >
              <div class="session-device-info">
                <div class="session-device-title">
                  <strong>{{ session.deviceName }}</strong>
                  <small v-if="session.deviceType" class="session-device-type">
                    {{ session.deviceType === 'browser' ? '浏览器会话' : '电脑客户端会话' }}
                  </small>
                  <span v-if="session.current" class="session-current-badge">当前设备</span>
                </div>
                <small>最近活动：{{ formatSessionTime(session.lastActiveAt) }}</small>
              </div>
              <div v-if="!session.current" class="session-row-actions">
                <button
                  v-if="confirmSessionToRevoke !== session.sessionId"
                  class="message-search-clear"
                  :data-testid="`revoke-session-${session.sessionId}`"
                  type="button"
                  :disabled="Boolean(sessionActionId)"
                  @click="confirmSessionToRevoke = session.sessionId"
                >退出此设备</button>
                <template v-else>
                  <button
                    class="session-revoke-confirm"
                    :data-testid="`confirm-revoke-session-${session.sessionId}`"
                    type="button"
                    :disabled="Boolean(sessionActionId)"
                    @click="revokeSession(session)"
                  >{{ sessionActionId === session.sessionId ? '正在退出…' : '确认退出' }}</button>
                  <button class="message-search-clear" type="button" @click="confirmSessionToRevoke = ''">取消</button>
                </template>
              </div>
            </li>
          </ul>
          <div v-if="hasOtherSessions" class="session-management-actions">
            <template v-if="confirmRevokeOtherSessions">
              <span>确认退出所有其他设备？</span>
              <button
                class="session-revoke-confirm"
                data-testid="confirm-revoke-other-sessions"
                type="button"
                :disabled="Boolean(sessionActionId)"
                @click="revokeOtherSessions"
              >{{ sessionActionId === 'others' ? '正在退出…' : '确认退出其他设备' }}</button>
              <button class="message-search-clear" type="button" @click="confirmRevokeOtherSessions = false">取消</button>
            </template>
            <button
              v-else
              class="message-search-clear"
              data-testid="revoke-other-sessions"
              type="button"
              :disabled="Boolean(sessionActionId)"
              @click="confirmRevokeOtherSessions = true"
            >退出其他所有设备</button>
          </div>
        </section>

          </section>

          <section id="profile-section-security" class="profile-settings-section" aria-labelledby="profile-section-security-title">
            <h3 id="profile-section-security-title" class="profile-settings-section-title">账号安全</h3>

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
      </section>
    </div>
  </main>
</template>
