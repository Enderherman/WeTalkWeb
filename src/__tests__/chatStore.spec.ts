import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/stores/chat'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

describe('chat initialization state', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stores the sessions, recent messages, and unread application count from INIT', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()

    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [
          {
            sessionId: 'S100',
            contactId: 'U200',
            contactName: 'Friend',
            lastMessage: 'Hello',
            lastReceiveTime: 1000,
            contactType: 0,
          },
        ],
        chatMessageList: [
          {
            messageId: 1,
            sessionId: 'S100',
            messageType: 2,
            messageContent: 'Hello',
            sendUserId: 'U200',
            sendUserNickName: 'Friend',
            sendTime: 1000,
            contactId: 'U100',
          },
        ],
        applyCount: 2,
      },
    })

    expect(chatStore.initialized).toBe(true)
    expect(chatStore.sessionList[0]?.contactName).toBe('Friend')
    expect(chatStore.initialMessages).toHaveLength(1)
    expect(chatStore.applyCount).toBe(2)
  })

  it('notifies the app when the server sends a forced-offline message', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    const listener = vi.fn()
    window.addEventListener(AUTH_EXPIRED_EVENT, listener)

    chatStore.receiveMessage({ messageType: 7 })

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(AUTH_EXPIRED_EVENT, listener)
  })
})
