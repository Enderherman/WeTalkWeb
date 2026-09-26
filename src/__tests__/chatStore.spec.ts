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

  it('adds a live text message once and updates its session summary', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    const session = {
      sessionId: 'S100',
      contactId: 'U200',
      contactName: 'Friend',
      lastMessage: '',
      lastReceiveTime: 1000,
      contactType: 0,
    }
    chatStore.receiveMessage({ messageType: 0, extentData: { chatSessionList: [session], chatMessageList: [], applyCount: 0 } })
    const message = {
      messageId: 12,
      sessionId: 'S100',
      messageType: 2,
      messageContent: 'Hi there',
      sendUserId: 'U200',
      sendUserNickName: 'Friend',
      sendTime: 2000,
      contactId: 'U100',
    }

    chatStore.receiveMessage(message)
    chatStore.receiveMessage(message)

    expect(chatStore.initialMessages).toHaveLength(1)
    expect(chatStore.sessionList[0]?.lastMessage).toBe('Friend: Hi there')
    expect(chatStore.sessionList[0]?.lastReceiveTime).toBe(2000)
  })

  it('increments the application badge when a live friend request arrives', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.applyCount = 2

    chatStore.receiveMessage({ messageType: 4, messageContent: 'Please add me' })

    expect(chatStore.applyCount).toBe(3)
    expect(chatStore.initialMessages).toHaveLength(0)
  })

  it('merges older history pages in chronological order and updates the cursor', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    const message = (messageId: number) => ({
      messageId,
      sessionId: 'S100',
      messageType: 2,
      messageContent: `message-${messageId}`,
      sendUserId: 'U200',
      sendUserNickName: 'Friend',
      sendTime: messageId * 1000,
      contactId: 'U100',
    })

    chatStore.setHistoryPage('S100', {
      pageNo: 1,
      pageSize: 2,
      pageTotal: 2,
      totalCount: 3,
      list: [message(2), message(3)],
    })
    expect(chatStore.historyBySession.S100).toEqual({ beforeMessageId: 2, hasMore: true, loaded: true })

    chatStore.setHistoryPage('S100', {
      pageNo: 1,
      pageSize: 2,
      pageTotal: 1,
      totalCount: 1,
      list: [message(1)],
    }, true)

    expect(chatStore.initialMessages.map((item) => item.messageId)).toEqual([1, 2, 3])
    expect(chatStore.historyBySession.S100).toEqual({ beforeMessageId: 1, hasMore: false, loaded: true })
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
