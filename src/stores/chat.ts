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
        this.sessionList = data.chatSessionList
        this.initialMessages = data.chatMessageList
        this.applyCount = Number(data.applyCount) || 0
        this.initialized = true
        return
      }

      if (message.messageType === 7) {
        this.disconnect()
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
      }
    },
    clear() {
      this.disconnect()
      this.initialized = false
      this.sessionList = []
      this.initialMessages = []
      this.applyCount = 0
      this.connectionError = ''
    },
  },
})
