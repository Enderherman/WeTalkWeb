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

  it('adds a live group join event once and refreshes the member count', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.accountId = 'U100'
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'SG300',
          contactId: 'G300',
          contactName: 'Study Group',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 1,
          memberCount: 1,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    const joinEvent = {
      messageId: 50,
      sessionId: 'SG300',
      messageType: 9,
      messageContent: 'New Member加入了群组',
      sendUserId: null,
      sendUserNickName: null,
      sendTime: 2000,
      contactId: 'G300',
      contactType: 1,
      memberCount: 2,
    }

    chatStore.receiveMessage(joinEvent)
    chatStore.receiveMessage(joinEvent)

    expect(chatStore.sessionList[0]?.memberCount).toBe(2)
    expect(chatStore.sessionList[0]?.lastMessage).toBe('New Member加入了群组')
    expect(chatStore.initialMessages.filter((message) => message.messageType === 9)).toHaveLength(1)
    expect(chatStore.groupEventVersion).toBe(1)
  })

  it('creates the group session for a newly added member who did not have it in INIT', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: { chatSessionList: [], chatMessageList: [], applyCount: 0 },
    })

    chatStore.receiveMessage({
      messageId: 51,
      sessionId: 'SG300',
      messageType: 9,
      messageContent: 'You joined the group',
      sendTime: 2000,
      contactId: 'G300',
      contactName: 'Study Group',
      contactType: 1,
      memberCount: 2,
    })

    expect(chatStore.sessionList).toMatchObject([{
      sessionId: 'SG300',
      contactId: 'G300',
      contactName: 'Study Group',
      memberCount: 2,
    }])
    expect(chatStore.initialMessages).toHaveLength(1)
  })

  it('creates the owner session from a live group-created event', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageId: 2,
      messageType: 3,
      messageContent: '群组已经创建好，可以和好友一起畅聊了',
      sendTime: 2000,
      contactId: 'G300',
      contactType: 1,
      extentData: {
        sessionId: 'SG300',
        contactId: 'G300',
        contactName: 'Study Group',
        lastMessage: '群创建成功',
        lastReceiveTime: 2000,
        memberCount: 1,
      },
    })

    expect(chatStore.sessionList).toMatchObject([{
      sessionId: 'SG300',
      contactId: 'G300',
      contactName: 'Study Group',
      memberCount: 1,
    }])
    expect(chatStore.initialMessages[0]?.messageType).toBe(3)
  })

  it('updates a group name from a live contact-name event', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'SG300',
          contactId: 'G300',
          contactName: 'Study Group',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 1,
          memberCount: 2,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })

    chatStore.receiveMessage({
      messageType: 10,
      contactId: 'G300',
      contactType: 1,
      extentData: 'Renamed Group',
    })

    expect(chatStore.sessionList[0]?.contactName).toBe('Renamed Group')
    expect(chatStore.groupEventVersion).toBe(1)
  })

  it('marks the current user as removed and re-enables access after a later join', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.accountId = 'U100'
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'SG300',
          contactId: 'G300',
          contactName: 'Study Group',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 1,
          memberCount: 2,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })

    chatStore.receiveMessage({
      messageId: 52,
      sessionId: 'SG300',
      messageType: 12,
      messageContent: 'You were removed from the group',
      sendTime: 2000,
      contactId: 'G300',
      extentData: 'U100',
      memberCount: 1,
    })
    expect(chatStore.sessionList[0]?.groupAccessRevoked).toBe(true)
    expect(chatStore.sessionList[0]?.memberCount).toBe(1)

    chatStore.receiveMessage({
      messageId: 53,
      sessionId: 'SG300',
      messageType: 9,
      messageContent: 'You joined the group',
      sendTime: 3000,
      contactId: 'G300',
      memberCount: 2,
    })

    expect(chatStore.sessionList[0]?.groupAccessRevoked).toBe(false)
    expect(chatStore.sessionList[0]?.memberCount).toBe(2)
  })

  it('marks a dissolved group as closed and retains its system message', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'SG300',
          contactId: 'G300',
          contactName: 'Study Group',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 1,
          memberCount: 2,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })

    chatStore.receiveMessage({
      messageId: 54,
      sessionId: 'SG300',
      messageType: 8,
      messageContent: '群聊已解散',
      sendTime: 2000,
      contactId: 'G300',
    })

    expect(chatStore.sessionList[0]?.groupClosed).toBe(true)
    expect(chatStore.initialMessages[0]?.messageType).toBe(8)
  })
})
