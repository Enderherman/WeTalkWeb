import { defineStore } from 'pinia'
import type { ChatSessionSummary } from '@/stores/chat'

interface HiddenConversation {
  lastReceiveTime: number
  lastMessage: string
}

const storagePrefix = 'wetalk-web.conversations.v1.'

export const useConversationPreferencesStore = defineStore('conversation-preferences', {
  state: () => ({
    accountId: '',
    pinned: [] as string[],
    hidden: {} as Record<string, HiddenConversation>,
    storageError: '',
  }),
  actions: {
    load(accountId: string) {
      this.accountId = accountId
      this.pinned = []
      this.hidden = {}
      this.storageError = ''
      if (!accountId) return
      try {
        const raw = window.localStorage.getItem(storagePrefix + accountId)
        if (!raw) return
        const value = JSON.parse(raw)
        if (Array.isArray(value.pinned)) this.pinned = value.pinned.filter((id: unknown) => typeof id === 'string')
        if (value.hidden && typeof value.hidden === 'object') {
          for (const [id, marker] of Object.entries(value.hidden)) {
            if (marker && typeof marker === 'object' && 'lastReceiveTime' in marker && 'lastMessage' in marker
              && typeof marker.lastReceiveTime === 'number' && typeof marker.lastMessage === 'string') {
              this.hidden[id] = { lastReceiveTime: marker.lastReceiveTime, lastMessage: marker.lastMessage }
            }
          }
        }
      } catch {
        this.storageError = '本浏览器无法读取会话偏好；当前页面仍可使用。'
      }
    },
    save() {
      if (!this.accountId) return
      try {
        window.localStorage.setItem(storagePrefix + this.accountId, JSON.stringify({ pinned: this.pinned, hidden: this.hidden }))
        this.storageError = ''
      } catch {
        this.storageError = '会话偏好仅在当前页面有效，浏览器未能保存。'
      }
    },
    togglePin(sessionId: string) {
      this.pinned = this.pinned.includes(sessionId)
        ? this.pinned.filter((id) => id !== sessionId)
        : [...this.pinned, sessionId]
      this.save()
    },
    hide(session: ChatSessionSummary) {
      this.hidden[session.sessionId] = { lastReceiveTime: session.lastReceiveTime, lastMessage: session.lastMessage }
      this.save()
    },
    isHidden(session: ChatSessionSummary) {
      const marker = this.hidden[session.sessionId]
      return Boolean(marker && session.lastReceiveTime <= marker.lastReceiveTime && session.lastMessage === marker.lastMessage)
    },
    restore(sessionId: string) {
      delete this.hidden[sessionId]
      this.save()
    },
    restoreUpdated(sessions: ChatSessionSummary[]) {
      let changed = false
      for (const session of sessions) {
        if (this.hidden[session.sessionId] && !this.isHidden(session)) {
          delete this.hidden[session.sessionId]
          changed = true
        }
      }
      if (changed) this.save()
    },
  },
})
