import { defineStore } from 'pinia'
import { createRealtimeClient, type RealtimeStatus, type ServerMessage } from '@/api/realtime'
import { textMessageCache } from '@/storage/textMessageCache'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

export interface ChatSessionSummary {
  sessionId: string
  contactId: string
  contactName: string
  lastMessage: string
  lastReceiveTime: number
  contactType: number
  noReadCount?: number
  peerReadMessageId?: number
  memberCount?: number | null
  groupClosed?: boolean
  groupAccessRevoked?: boolean
}

export interface InitialChatMessage {
  messageId: number
  sessionId: string
  messageType: number
  messageContent: string
  sendUserId: string | null
  sendUserNickName: string | null
  sendTime: number
  contactId: string
  contactName?: string
  memberCount?: number
  extentData?: unknown
  fileSize?: number
  fileName?: string
  fileType?: number
  status?: number
  uploadProgress?: number
  uploadError?: string
  aiStatus?: 'waiting' | 'streaming' | 'complete' | 'interrupted' | 'cancelled' | 'failed'
}

export interface ChatHistoryPage {
  pageNo: number
  pageSize: number
  pageTotal: number
  totalCount: number
  list: InitialChatMessage[]
}

export interface SessionHistoryState {
  beforeMessageId: number | null
  hasMore: boolean
  loaded: boolean
}

interface InitialData {
  chatSessionList: ChatSessionSummary[]
  chatMessageList: InitialChatMessage[]
  applyCount: number
}

let realtimeClient: ReturnType<typeof createRealtimeClient> | null = null
const aiResponseTimeoutMs = 30_000
const aiResponseTimeouts = new Map<number, ReturnType<typeof setTimeout>>()

function clearAiResponseTimeout(messageId: number) {
  const timer = aiResponseTimeouts.get(messageId)
  if (timer !== undefined) clearTimeout(timer)
  aiResponseTimeouts.delete(messageId)
}

function scheduleAiResponseTimeout(messageId: number, onTimeout: () => void) {
  clearAiResponseTimeout(messageId)
  aiResponseTimeouts.set(messageId, setTimeout(() => {
    aiResponseTimeouts.delete(messageId)
    onTimeout()
  }, aiResponseTimeoutMs))
}

function normalizeHistoryMessage(message: InitialChatMessage): InitialChatMessage {
  if (message.messageType !== 14) return message
  if (message.status === 2) return { ...message, aiStatus: 'cancelled' }
  if (message.status === 3) return { ...message, aiStatus: 'failed' }
  return {
    ...message,
    aiStatus: message.messageContent.trim() ? 'complete' : 'waiting',
  }
}

export function compareMessagesByServerOrder(
  left: Pick<InitialChatMessage, 'messageId' | 'sendTime'>,
  right: Pick<InitialChatMessage, 'messageId' | 'sendTime'>,
) {
  const leftId = Number(left.messageId) || 0
  const rightId = Number(right.messageId) || 0
  if (leftId > 0 && rightId > 0 && leftId !== rightId) return leftId - rightId
  return (Number(left.sendTime) || 0) - (Number(right.sendTime) || 0) || leftId - rightId
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    connectionStatus: 'idle' as RealtimeStatus,
    accountId: '',
    activeSessionId: '',
    initialized: false,
    sessionList: [] as ChatSessionSummary[],
    initialMessages: [] as InitialChatMessage[],
    historyBySession: {} as Record<string, SessionHistoryState>,
    applyCount: 0,
    groupEventVersion: 0,
    connectionError: '',
  }),
  getters: {
    totalUnreadCount: (state) => state.sessionList.reduce((total, session) => total + (session.noReadCount || 0), 0),
  },
  actions: {
    connect(accountId: string) {
      this.disconnect()
      if (!accountId) return
      if (this.accountId && this.accountId !== accountId) {
        this.initialized = false
        this.sessionList = []
        this.activeSessionId = ''
        this.initialMessages = []
        this.historyBySession = {}
        this.applyCount = 0
        this.groupEventVersion = 0
      }
      this.accountId = accountId
      this.connectionError = ''
      this.connectionStatus = 'connecting'
      realtimeClient = createRealtimeClient({
        onStatus: (status) => {
          this.connectionStatus = status
        },
        onMessage: (message) => this.receiveMessage(message),
        onError: (message) => {
          this.connectionError = message
        },
      })
    },
    disconnect() {
      realtimeClient?.disconnect()
      realtimeClient = null
      this.connectionStatus = 'idle'
    },
    setActiveSession(sessionId: string) {
      this.activeSessionId = sessionId
      const session = this.sessionList.find((item) => item.sessionId === sessionId)
      if (session && session.noReadCount) {
        session.noReadCount = 0
        this.sessionList = [...this.sessionList]
      }
    },
    receiveMessage(message: ServerMessage) {
      if (message.messageType === 0) {
        const data = message.extentData as Partial<InitialData> | null | undefined
        if (!data || !Array.isArray(data.chatSessionList) || !Array.isArray(data.chatMessageList)) return
        const sessionIds = new Set(data.chatSessionList.map((session) => session.sessionId))
        const retainedMessages = this.initialMessages.filter((item) => sessionIds.has(item.sessionId))
        const merged = new Map<number, InitialChatMessage>()
        for (const item of retainedMessages) merged.set(item.messageId, item)
        for (const item of data.chatMessageList) {
          const normalized = normalizeHistoryMessage(item)
          const previous = merged.get(item.messageId)
          if (normalized.aiStatus === 'waiting' && previous?.messageType === 14 && previous.messageContent) {
            merged.set(item.messageId, { ...normalized, messageContent: previous.messageContent, aiStatus: 'streaming' })
          } else {
            merged.set(item.messageId, normalized)
          }
        }
        const currentGroupState = new Map(
          this.sessionList.map((session) => [
            session.contactId,
            {
              groupClosed: session.groupClosed,
              groupAccessRevoked: session.groupAccessRevoked,
              memberCount: session.memberCount,
              noReadCount: session.noReadCount,
              peerReadMessageId: session.peerReadMessageId,
            },
          ]),
        )
        this.sessionList = data.chatSessionList.map((session) => {
          const previous = currentGroupState.get(session.contactId)
          return {
            ...session,
            groupClosed: previous?.groupClosed,
            groupAccessRevoked: previous?.groupAccessRevoked,
            memberCount: session.memberCount ?? previous?.memberCount,
            noReadCount: Math.max(0, Number(session.noReadCount ?? previous?.noReadCount) || 0),
            peerReadMessageId: Math.max(
              Number(session.peerReadMessageId) || 0,
              Number(previous?.peerReadMessageId) || 0,
            ),
          }
        })
        this.initialMessages = [...merged.values()].sort(compareMessagesByServerOrder)
        const pendingAiIds = new Set<number>()
        for (const item of this.initialMessages) {
          if (item.messageType === 14 && (item.aiStatus === 'waiting' || item.aiStatus === 'streaming')) {
            pendingAiIds.add(item.messageId)
            scheduleAiResponseTimeout(item.messageId, () => this.markAiResponseInterrupted(item.messageId))
          }
        }
        for (const messageId of aiResponseTimeouts.keys()) {
          if (!pendingAiIds.has(messageId)) clearAiResponseTimeout(messageId)
        }
        this.historyBySession = Object.fromEntries(
          Object.entries(this.historyBySession).filter(([sessionId]) => sessionIds.has(sessionId)),
        )
        this.applyCount = Number(data.applyCount) || 0
        this.initialized = true
        if (this.accountId) {
          void textMessageCache.saveTextMessages(this.accountId, data.chatMessageList).catch(() => undefined)
        }
        return
      }

      if (message.messageType === 2) {
        this.appendMessage(message as unknown as InitialChatMessage, false)
        return
      }

      if (message.messageType === 5) {
        this.appendMessage(message as unknown as InitialChatMessage, false)
        return
      }

      if (message.messageType === 6) {
        this.markFileUploadComplete(Number(message.messageId))
        return
      }

      if (message.messageType === 17) {
        this.receiveReadReceipt(message)
        return
      }

      if (message.messageType === 14 || message.messageType === 15 || message.messageType === 16) {
        this.receiveAiMessage(message)
        return
      }

      if (message.messageType === 4) {
        this.applyCount += 1
        return
      }

      if ([3, 8, 9, 10, 11, 12].includes(message.messageType)) {
        this.receiveGroupEvent(message)
        return
      }

      if (message.messageType === 7) {
        this.disconnect()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    },
    receiveReadReceipt(message: ServerMessage) {
      const sessionId = typeof message.sessionId === 'string' ? message.sessionId : ''
      const readerId = typeof message.sendUserId === 'string' ? message.sendUserId : ''
      const contactId = typeof message.contactId === 'string' ? message.contactId : ''
      const messageId = Number(message.messageId)
      if (!sessionId || !readerId || contactId !== readerId || readerId === this.accountId
          || !Number.isSafeInteger(messageId) || messageId < 1) return

      const session = this.sessionList.find((item) => item.sessionId === sessionId)
      if (!session || session.contactType !== 0 || session.contactId !== readerId) return
      session.peerReadMessageId = Math.max(Number(session.peerReadMessageId) || 0, messageId)
      this.sessionList = [...this.sessionList]
    },
    receiveGroupEvent(message: ServerMessage) {
      const groupId = typeof message.contactId === 'string' ? message.contactId : ''
      if (!groupId) return
      const messageType = message.messageType
      const eventName = typeof message.extentData === 'string' ? message.extentData : ''
      const sessionData =
        message.extentData && typeof message.extentData === 'object'
          ? (message.extentData as Partial<ChatSessionSummary>)
          : null
      const messageId = Number(message.messageId)
      if (
        messageType !== 10 &&
        Number.isFinite(messageId) &&
        this.initialMessages.some((item) => item.messageId === messageId)
      ) return
      let session = this.sessionList.find((item) => item.contactId === groupId)

      const eventSessionId =
        typeof message.sessionId === 'string'
          ? message.sessionId
          : typeof sessionData?.sessionId === 'string'
            ? sessionData.sessionId
            : ''
      if (!session && (messageType === 3 || messageType === 9) && eventSessionId) {
        session = {
          sessionId: eventSessionId,
          contactId: groupId,
          contactName:
            (typeof message.contactName === 'string' ? message.contactName : '') ||
            (typeof sessionData?.contactName === 'string' ? sessionData.contactName : groupId),
          lastMessage:
            (typeof message.messageContent === 'string' ? message.messageContent : '') ||
            (typeof sessionData?.lastMessage === 'string' ? sessionData.lastMessage : ''),
          lastReceiveTime:
            Number(message.sendTime) ||
            (typeof sessionData?.lastReceiveTime === 'number' ? sessionData.lastReceiveTime : 0),
          contactType: 1,
          memberCount:
            typeof message.memberCount === 'number'
              ? message.memberCount
              : typeof sessionData?.memberCount === 'number'
                ? sessionData.memberCount
                : undefined,
        }
        this.sessionList = [...this.sessionList, session]
      }

      if (session && messageType === 10) {
        const updatedName = eventName || (typeof message.contactName === 'string' ? message.contactName : '')
        if (updatedName) session.contactName = updatedName
        this.groupEventVersion += 1
        this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
        return
      }

      if (session) {
        const memberCount = Number(message.memberCount)
        if (Number.isFinite(memberCount) && memberCount >= 0) {
          session.memberCount = memberCount
        } else if (messageType === 3 && typeof sessionData?.memberCount === 'number') {
          session.memberCount = sessionData.memberCount
        } else if (messageType === 9 && typeof session.memberCount === 'number') {
          session.memberCount += 1
        } else if ((messageType === 11 || messageType === 12) && typeof session.memberCount === 'number') {
          session.memberCount = Math.max(0, session.memberCount - 1)
        }

        if (messageType === 8) session.groupClosed = true
        if ((messageType === 11 || messageType === 12) && message.extentData === this.accountId) {
          session.groupAccessRevoked = true
        }
        if (messageType === 3 || messageType === 9) {
          session.groupClosed = false
          session.groupAccessRevoked = false
        }

        if (Number.isFinite(messageId)) {
          const eventMessage = message as unknown as InitialChatMessage
          if (!this.initialMessages.some((item) => item.messageId === eventMessage.messageId)) {
            this.initialMessages = [...this.initialMessages, eventMessage].sort(compareMessagesByServerOrder)
          }
          session.lastMessage = typeof message.messageContent === 'string' ? message.messageContent : session.lastMessage
          session.lastReceiveTime = Number(message.sendTime) || session.lastReceiveTime
        }
      }

      this.groupEventVersion += 1
      this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
    },
    receiveAiMessage(message: ServerMessage) {
      const messageId = Number(message.messageId)
      const sessionId = typeof message.sessionId === 'string' ? message.sessionId : ''
      if (!Number.isSafeInteger(messageId) || messageId < 1 || !sessionId) return

      const content = typeof message.messageContent === 'string' ? message.messageContent : ''
      const messageType = Number(message.messageType)
      const messageStatus = typeof message.status === 'number' ? message.status : null
      const aiStatus = messageStatus === 2
        ? 'cancelled'
        : messageStatus === 3
          ? 'failed'
          : messageType === 16
            ? 'complete'
            : messageType === 15
              ? 'streaming'
              : content
                ? 'complete'
                : 'waiting'
      const previous = this.initialMessages.find((item) => item.messageId === messageId)
      const aiMessage: InitialChatMessage = {
        ...(previous || {} as InitialChatMessage),
        ...message as unknown as Partial<InitialChatMessage>,
        messageId,
        sessionId,
        messageType: 14,
        messageContent: content,
        sendUserId: typeof message.sendUserId === 'string' ? message.sendUserId : previous?.sendUserId || null,
        sendUserNickName: typeof message.sendUserNickName === 'string'
          ? message.sendUserNickName
          : previous?.sendUserNickName || null,
        sendTime: Number(message.sendTime) || previous?.sendTime || Date.now(),
        contactId: typeof message.contactId === 'string' ? message.contactId : previous?.contactId || '',
        status: messageStatus ?? previous?.status,
        aiStatus,
      }
      if (previous) {
        this.initialMessages = this.initialMessages.map((item) => item.messageId === messageId ? aiMessage : item)
      } else {
        this.initialMessages = [...this.initialMessages, aiMessage].sort(compareMessagesByServerOrder)
      }

      const session = this.sessionList.find((item) => item.sessionId === sessionId)
      if (session) {
        if (!previous && messageType === 14 && session.sessionId !== this.activeSessionId) {
          session.noReadCount = (session.noReadCount || 0) + 1
        }
        const preview = content || (aiStatus === 'complete'
          ? 'AI 没有返回文本'
          : aiStatus === 'cancelled'
            ? 'AI 生成已停止'
            : aiStatus === 'failed'
              ? 'AI 生成失败，请重试'
              : 'AI 正在思考…')
        session.lastMessage = `${aiMessage.sendUserNickName || session.contactName}: ${preview}`
        session.lastReceiveTime = aiMessage.sendTime
        this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
      }

      if (aiStatus === 'complete' || aiStatus === 'cancelled' || aiStatus === 'failed') {
        clearAiResponseTimeout(messageId)
      } else {
        scheduleAiResponseTimeout(messageId, () => this.markAiResponseInterrupted(messageId))
      }
      if (content && this.accountId) {
        void textMessageCache.saveTextMessages(this.accountId, [aiMessage]).catch(() => undefined)
      }
    },
    markAiResponseInterrupted(messageId: number) {
      const message = this.initialMessages.find((item) => item.messageId === messageId)
      if (!message || ['complete', 'cancelled', 'failed'].includes(message.aiStatus || '')) return
      message.aiStatus = 'interrupted'
      this.initialMessages = [...this.initialMessages]
      const session = this.sessionList.find((item) => item.sessionId === message.sessionId)
      if (session && !message.messageContent) {
        session.lastMessage = `${message.sendUserNickName || session.contactName}: AI 回复中断，请重新发送问题`
      }
    },
    appendMessage(message: InitialChatMessage, sentByCurrentUser: boolean) {
      if (this.initialMessages.some((item) => item.messageId === message.messageId)) return
      this.initialMessages = [...this.initialMessages, message].sort(compareMessagesByServerOrder)
      if (this.accountId) {
        void textMessageCache.saveTextMessages(this.accountId, [message]).catch(() => undefined)
      }
      const session = this.sessionList.find((item) => item.sessionId === message.sessionId)
      if (session) {
        const isIncoming = !sentByCurrentUser && Boolean(message.sendUserId) && message.sendUserId !== this.accountId
        if (isIncoming && session.sessionId !== this.activeSessionId) {
          session.noReadCount = (session.noReadCount || 0) + 1
        }
        const messagePreview = message.messageType === 5 ? message.fileName || '文件' : message.messageContent
        session.lastMessage = sentByCurrentUser || message.messageType === 5
          ? messagePreview
          : `${message.sendUserNickName}: ${messagePreview}`
        session.lastReceiveTime = message.sendTime
      }
      this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
    },
    setFileUploadProgress(messageId: number, progress: number) {
      this.initialMessages = this.initialMessages.map((message) =>
        message.messageId === messageId
          ? { ...message, uploadProgress: Math.max(0, Math.min(100, progress)), uploadError: undefined }
          : message,
      )
    },
    markFileUploadFailed(messageId: number, message: string) {
      this.initialMessages = this.initialMessages.map((item) =>
        item.messageId === messageId ? { ...item, uploadError: message } : item,
      )
    },
    markFileUploadComplete(messageId: number) {
      this.initialMessages = this.initialMessages.map((message) =>
        message.messageId === messageId
          ? { ...message, status: 1, uploadProgress: 100, uploadError: undefined }
          : message,
      )
    },
    mergeCachedMessages(sessionId: string, messages: InitialChatMessage[]) {
      const existing = this.initialMessages.filter((message) => message.sessionId === sessionId)
      const otherSessions = this.initialMessages.filter((message) => message.sessionId !== sessionId)
      const merged = new Map<number, InitialChatMessage>()
      for (const message of [...existing, ...messages]) merged.set(message.messageId, message)
      for (const [messageId, message] of merged) {
        if (message.messageType === 14 && !['complete', 'cancelled', 'failed'].includes(message.aiStatus || '')) {
          merged.set(messageId, { ...message, aiStatus: 'interrupted' })
        }
      }
      const sessionMessages = [...merged.values()].sort(compareMessagesByServerOrder)
      this.initialMessages = [...otherSessions, ...sessionMessages].sort(compareMessagesByServerOrder)
    },
    setHistoryPage(sessionId: string, page: ChatHistoryPage, appendOlder = false) {
      const existing = this.initialMessages.filter((item) => item.sessionId === sessionId)
      const existingById = new Map(existing.map((item) => [item.messageId, item]))
      const pageMessages = (page.list || []).map((message) => {
        const normalized = normalizeHistoryMessage(message)
        const previous = existingById.get(message.messageId)
        return normalized.aiStatus === 'waiting' && previous?.messageType === 14 && previous.messageContent
          ? { ...normalized, messageContent: previous.messageContent, aiStatus: 'streaming' as const }
          : normalized
      })
      const otherSessions = this.initialMessages.filter((item) => item.sessionId !== sessionId)
      const newestPageId = pageMessages.reduce((latest, item) => Math.max(latest, item.messageId), 0)
      const keepLiveMessages = appendOlder
        ? existing
        : existing.filter((item) => item.messageId > newestPageId)
      const merged = new Map<number, InitialChatMessage>()
      for (const item of [...pageMessages, ...keepLiveMessages]) merged.set(item.messageId, item)
      const sessionMessages = [...merged.values()].sort(compareMessagesByServerOrder)
      const previous = this.historyBySession[sessionId]
      this.initialMessages = [...otherSessions, ...sessionMessages].sort(compareMessagesByServerOrder)
      for (const item of sessionMessages) {
        if (item.messageType === 14 && (item.aiStatus === 'waiting' || item.aiStatus === 'streaming')) {
          scheduleAiResponseTimeout(item.messageId, () => this.markAiResponseInterrupted(item.messageId))
        } else if (item.messageType === 14) {
          clearAiResponseTimeout(item.messageId)
        }
      }
      this.historyBySession = {
        ...this.historyBySession,
        [sessionId]: {
          beforeMessageId: pageMessages[0]?.messageId ?? previous?.beforeMessageId ?? null,
          hasMore: page.pageNo < page.pageTotal,
          loaded: true,
        },
      }
      if (this.accountId) {
        void textMessageCache.saveTextMessages(this.accountId, pageMessages).catch(() => undefined)
      }
    },
    clear() {
      for (const messageId of aiResponseTimeouts.keys()) clearAiResponseTimeout(messageId)
      this.disconnect()
      this.initialized = false
      this.sessionList = []
      this.activeSessionId = ''
      this.initialMessages = []
      this.historyBySession = {}
      this.accountId = ''
      this.applyCount = 0
      this.groupEventVersion = 0
      this.connectionError = ''
    },
  },
})
