import { defineStore } from 'pinia'
import { createRealtimeClient, type RealtimeStatus, type ServerMessage } from '@/api/realtime'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

export interface ChatSessionSummary {
  sessionId: string
  contactId: string
  contactName: string
  lastMessage: string
  lastReceiveTime: number
  contactType: number
  memberCount?: number
}

export interface InitialChatMessage {
  messageId: number
  sessionId: string
  messageType: number
  messageContent: string
  sendUserId: string
  sendUserNickName: string
  sendTime: number
  contactId: string
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
    initialized: false,
    sessionList: [] as ChatSessionSummary[],
    initialMessages: [] as InitialChatMessage[],
    historyBySession: {} as Record<string, SessionHistoryState>,
    applyCount: 0,
    connectionError: '',
  }),
  actions: {
    connect(token: string) {
      this.disconnect()
      this.connectionError = ''
      this.connectionStatus = 'connecting'
      realtimeClient = createRealtimeClient(token, {
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
    receiveMessage(message: ServerMessage) {
      if (message.messageType === 0) {
        const data = message.extentData as Partial<InitialData> | null | undefined
        if (!data || !Array.isArray(data.chatSessionList) || !Array.isArray(data.chatMessageList)) return
        const sessionIds = new Set(data.chatSessionList.map((session) => session.sessionId))
        const retainedMessages = this.initialMessages.filter((item) => sessionIds.has(item.sessionId))
        const merged = new Map<number, InitialChatMessage>()
        for (const item of retainedMessages) merged.set(item.messageId, item)
        for (const item of data.chatMessageList) merged.set(item.messageId, item)
        this.sessionList = data.chatSessionList
        this.initialMessages = [...merged.values()].sort((a, b) => a.sendTime - b.sendTime)
        this.historyBySession = Object.fromEntries(
          Object.entries(this.historyBySession).filter(([sessionId]) => sessionIds.has(sessionId)),
        )
        this.applyCount = Number(data.applyCount) || 0
        this.initialized = true
        return
      }

      if (message.messageType === 2) {
        this.appendMessage(message as unknown as InitialChatMessage, false)
        return
      }

      if (message.messageType === 7) {
        this.disconnect()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    },
    appendMessage(message: InitialChatMessage, sentByCurrentUser: boolean) {
      if (this.initialMessages.some((item) => item.messageId === message.messageId)) return
      this.initialMessages = [...this.initialMessages, message].sort((a, b) => a.sendTime - b.sendTime)
      const session = this.sessionList.find((item) => item.sessionId === message.sessionId)
      if (session) {
        session.lastMessage = sentByCurrentUser
          ? message.messageContent
          : `${message.sendUserNickName}: ${message.messageContent}`
        session.lastReceiveTime = message.sendTime
      }
      this.sessionList = [...this.sessionList].sort((a, b) => b.lastReceiveTime - a.lastReceiveTime)
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
    },
    clear() {
      this.disconnect()
      this.initialized = false
      this.sessionList = []
      this.initialMessages = []
      this.historyBySession = {}
      this.applyCount = 0
      this.connectionError = ''
    },
  },
})
