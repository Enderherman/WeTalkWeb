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
        for (const item of data.chatMessageList) merged.set(item.messageId, item)
        const currentGroupState = new Map(
          this.sessionList.map((session) => [
            session.contactId,
            {
              groupClosed: session.groupClosed,
              groupAccessRevoked: session.groupAccessRevoked,
              memberCount: session.memberCount,
              noReadCount: session.noReadCount,
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
          }
        })
        this.initialMessages = [...merged.values()].sort((a, b) => a.sendTime - b.sendTime)
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
            this.initialMessages = [...this.initialMessages, eventMessage].sort((a, b) => a.sendTime - b.sendTime)
          }
          session.lastMessage = typeof message.messageContent === 'string' ? message.messageContent : session.lastMessage
          session.lastReceiveTime = Number(message.sendTime) || session.lastReceiveTime
        }
      }

      this.groupEventVersion += 1
      this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
    },
    appendMessage(message: InitialChatMessage, sentByCurrentUser: boolean) {
      if (this.initialMessages.some((item) => item.messageId === message.messageId)) return
      this.initialMessages = [...this.initialMessages, message].sort((a, b) => a.sendTime - b.sendTime)
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
      const sessionMessages = [...merged.values()].sort((a, b) => a.sendTime - b.sendTime)
      this.initialMessages = [...otherSessions, ...sessionMessages].sort((a, b) => a.sendTime - b.sendTime)
    },
    setHistoryPage(sessionId: string, page: ChatHistoryPage, appendOlder = false) {
      const pageMessages = page.list || []
      const existing = this.initialMessages.filter((item) => item.sessionId === sessionId)
      const otherSessions = this.initialMessages.filter((item) => item.sessionId !== sessionId)
      const newestPageId = pageMessages.reduce((latest, item) => Math.max(latest, item.messageId), 0)
      const keepLiveMessages = appendOlder
        ? existing
        : existing.filter((item) => item.messageId > newestPageId)
      const merged = new Map<number, InitialChatMessage>()
      for (const item of [...pageMessages, ...keepLiveMessages]) merged.set(item.messageId, item)
      const sessionMessages = [...merged.values()].sort((a, b) => a.sendTime - b.sendTime)
      const previous = this.historyBySession[sessionId]
      this.initialMessages = [...otherSessions, ...sessionMessages].sort((a, b) => a.sendTime - b.sendTime)
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
