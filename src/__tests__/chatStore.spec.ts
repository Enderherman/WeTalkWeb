import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/stores/chat'
import { AUTH_EXPIRED_EVENT } from '@/utils/authEvents'

describe('chat initialization state', () => {
  it('clears stale group removal flags when a fresh INIT restores valid membership', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    const session = { sessionId: 'SG1', contactId: 'G1', contactName: 'Group', contactType: 1,
      lastMessage: '', lastReceiveTime: 1, memberCount: 2 }
    const init = { messageType: 0, extentData: { chatSessionList: [session], chatMessageList: [], applyCount: 0 } }
    store.receiveMessage(init)
    store.receiveMessage({ messageType: 12, messageId: 11, sessionId: 'SG1', contactId: 'G1',
      messageContent: 'Removed', extentData: 'U100', memberCount: 1, sendTime: 2 })
    expect(store.sessionList[0]?.groupAccessRevoked).toBe(true)
    // The user rejoined through another device while this connection was offline.
    store.receiveMessage(init)
    expect(store.sessionList[0]?.groupAccessRevoked).toBe(false)
    expect(store.sessionList[0]?.groupClosed).toBe(false)
    expect(store.sessionList[0]?.memberCount).toBe(2)
  })

  it('restores private remarks and applies type 18 updates without changing real nicknames', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    store.receiveMessage({ messageType: 0, extentData: { chatSessionList: [{ sessionId: 'S1', contactId: 'U200',
      contactName: 'Original', remark: 'Old remark', contactType: 0, lastMessage: '', lastReceiveTime: 1 }], chatMessageList: [], applyCount: 0 } })
    expect(store.contactRemarks.U200).toBe('Old remark')
    store.receiveMessage({ messageType: 18, extentData: { contactId: 'U200', remark: 'New remark' } })
    expect(store.sessionList[0]).toMatchObject({ contactName: 'Original', remark: 'New remark' })
    expect(store.contactRemarks.U200).toBe('New remark')
    store.receiveMessage({ messageType: 18, extentData: { contactId: 'U200', remark: '' } })
    expect(store.contactRemarks.U200).toBe('')
    expect(store.initialMessages).toEqual([])
    store.clear()
    expect(store.contactRemarks).toEqual({})
  })

  it('creates a new direct conversation immediately on the delivered friend-accepted frame', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    const frame = { messageType: 1, messageId: 8, sessionId: 'Sfriend', contactId: 'U200', contactName: 'New friend',
      messageContent: 'Let us chat', sendUserId: 'U200', sendUserNickName: 'New friend', sendTime: 3000 }
    store.receiveMessage(frame)
    store.receiveMessage(frame)
    expect(store.sessionList).toMatchObject([{ sessionId: 'Sfriend', contactId: 'U200', contactName: 'New friend', noReadCount: 1 }])
    expect(store.initialMessages).toHaveLength(1)
    expect(store.contactEventVersion).toBe(1)
  })

  it('keeps the other party as the contact for the applicant self-notification', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    store.receiveMessage({ messageType: 13, messageId: 9, sessionId: 'Sfriend', contactId: 'U100',
      extentData: { userId: 'U200', nickName: 'Acceptor' },
      messageContent: 'Hello', sendUserId: 'U100', sendUserNickName: 'Me', sendTime: 3000 })
    expect(store.sessionList).toMatchObject([{ contactId: 'U200', contactName: 'Acceptor', noReadCount: 0 }])
    expect(store.initialMessages[0]?.messageType).toBe(1)
  })

  it.each(['websocket-first', 'http-first'])('deduplicates own private messages with %s delivery without unread or self-name prefix', (order) => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    store.receiveMessage({ messageType: 0, extentData: { chatSessionList: [{ sessionId: 'S1', contactId: 'U200',
      contactName: 'Peer', contactType: 0, lastMessage: '', lastReceiveTime: 1, noReadCount: 0 }], chatMessageList: [], applyCount: 0 } })
    const message = { messageId: 42, sessionId: 'S1', contactId: 'U200', contactType: 0, messageType: 2,
      sendUserId: 'U100', sendUserNickName: 'Me', messageContent: 'From my other device', sendTime: 2, status: 1 }
    if (order === 'websocket-first') { store.receiveMessage(message); store.appendMessage(message, true) }
    else { store.appendMessage(message, true); store.receiveMessage(message) }
    expect(store.initialMessages).toHaveLength(1)
    expect(store.sessionList[0]).toMatchObject({ contactId: 'U200', contactName: 'Peer', noReadCount: 0, lastMessage: message.messageContent })
  })

  it('merges authoritative file completion metadata from another device without creating another message', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    store.accountId = 'U100'
    store.receiveMessage({ messageType: 0, extentData: { chatSessionList: [{ sessionId: 'S1', contactId: 'U200',
      contactName: 'Peer', contactType: 0, lastMessage: '', lastReceiveTime: 1, noReadCount: 0 }], chatMessageList: [], applyCount: 0 } })
    store.receiveMessage({ messageId: 43, sessionId: 'S1', contactId: 'U200', contactType: 0, messageType: 5,
      sendUserId: 'U100', sendUserNickName: 'Me', messageContent: '[媒体]', sendTime: 2, status: 0,
      fileName: '原始视频.mp4', fileSize: 9000, fileType: 1 })
    const completion = { messageId: 43, sessionId: 'S1', contactId: 'U200', messageType: 6, sendUserId: 'U100',
      fileName: '原始视频.mp4', fileSize: 4200, fileType: 1, status: 1 }
    store.receiveMessage(completion)
    store.receiveMessage(completion)
    expect(store.initialMessages).toHaveLength(1)
    expect(store.initialMessages[0]).toMatchObject({ messageType: 5, fileName: '原始视频.mp4', fileSize: 4200, fileType: 1, status: 1, uploadProgress: 100 })
    expect(store.sessionList[0]?.noReadCount).toBe(0)
    store.receiveMessage({ messageType: 6, messageId: 43, status: 1 })
    expect(store.initialMessages[0]?.fileSize).toBe(4200)
  })

  it('does not turn a text message into a completed attachment on an invalid control frame', () => {
    setActivePinia(createPinia())
    const store = useChatStore()
    const message = { messageId: 44, sessionId: 'S1', contactId: 'U200', messageType: 2,
      sendUserId: 'U100', sendUserNickName: 'Me', messageContent: 'Text', sendTime: 2, status: 1 }
    store.appendMessage(message, true)
    store.receiveMessage({ messageType: 6, messageId: 44, status: 1, fileName: 'fake.txt', fileSize: 4, fileType: 2 })
    expect(store.initialMessages).toEqual([message])
  })

  afterEach(() => {
    useChatStore().clear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

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

  it('restores peer read cursors from INIT and only advances them on direct-message receipts', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    const session = {
      sessionId: 'S100',
      contactId: 'U200',
      contactName: 'Friend',
      lastMessage: '',
      lastReceiveTime: 1000,
      contactType: 0,
      peerReadMessageId: 12,
    }
    chatStore.accountId = 'U100'
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [session],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    expect(chatStore.sessionList[0]?.peerReadMessageId).toBe(12)

    chatStore.receiveMessage({
      messageType: 17,
      sessionId: 'S100',
      contactId: 'U200',
      sendUserId: 'U200',
      messageId: 18,
    })
    chatStore.receiveMessage({
      messageType: 17,
      sessionId: 'S100',
      contactId: 'U200',
      sendUserId: 'U200',
      messageId: 16,
    })
    expect(chatStore.sessionList[0]?.peerReadMessageId).toBe(18)

    chatStore.receiveMessage({
      messageType: 17,
      sessionId: 'S100',
      contactId: 'U200',
      sendUserId: 'U300',
      messageId: 30,
    })
    expect(chatStore.sessionList[0]?.peerReadMessageId).toBe(18)
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

  it('orders messages from different devices by server message ID when timestamps race', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S100', contactId: 'U200', contactName: 'Friend',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })

    chatStore.receiveMessage({
      messageId: 20, sessionId: 'S100', messageType: 2, messageContent: 'Committed second',
      sendUserId: 'U200', sendUserNickName: 'Friend', sendTime: 1000, contactId: 'U100',
    })
    chatStore.receiveMessage({
      messageId: 19, sessionId: 'S100', messageType: 2, messageContent: 'Committed first',
      sendUserId: 'U100', sendUserNickName: 'Student', sendTime: 1001, contactId: 'U200',
    })

    expect(chatStore.initialMessages.map((message) => message.messageId)).toEqual([19, 20])
  })

  it('counts incoming messages only for inactive sessions and clears counts when a session opens', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.accountId = 'U100'
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: ['S100', 'S200'].map((sessionId) => ({
          sessionId,
          contactId: sessionId === 'S100' ? 'U200' : 'U300',
          contactName: sessionId,
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        })),
        chatMessageList: [],
        applyCount: 0,
      },
    })
    chatStore.setActiveSession('S100')

    const incoming = {
      messageId: 20,
      sessionId: 'S200',
      messageType: 2,
      messageContent: 'Unread',
      sendUserId: 'U300',
      sendUserNickName: 'Contact',
      sendTime: 2000,
      contactId: 'U100',
    }
    chatStore.receiveMessage(incoming)
    chatStore.receiveMessage(incoming)
    chatStore.receiveMessage({ ...incoming, messageId: 21, sessionId: 'S100' })
    chatStore.receiveMessage({ ...incoming, messageId: 22, sendUserId: 'U100' })

    expect(chatStore.sessionList.find((item) => item.sessionId === 'S200')?.noReadCount).toBe(1)
    expect(chatStore.totalUnreadCount).toBe(1)

    chatStore.setActiveSession('S200')
    expect(chatStore.sessionList.find((item) => item.sessionId === 'S200')?.noReadCount).toBe(0)
    expect(chatStore.totalUnreadCount).toBe(0)
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

  it('tracks ordinary file upload progress and completes on the type 6 event', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'S100',
          contactId: 'U200',
          contactName: 'Friend',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })

    chatStore.receiveMessage({
      messageId: 60,
      sessionId: 'S100',
      messageType: 5,
      messageContent: '[文件]',
      sendUserId: 'U100',
      sendUserNickName: 'Student',
      sendTime: 2000,
      contactId: 'U200',
      fileName: 'notes.txt',
      fileSize: 2048,
      fileType: 2,
      status: 0,
    })
    chatStore.setFileUploadProgress(60, 45)
    expect(chatStore.initialMessages[0]?.uploadProgress).toBe(45)

    chatStore.receiveMessage({ messageType: 6, messageId: 60, contactId: 'U200', status: 1 })

    expect(chatStore.initialMessages[0]?.status).toBe(1)
    expect(chatStore.initialMessages[0]?.uploadProgress).toBe(100)
    expect(chatStore.sessionList[0]?.lastMessage).toBe('notes.txt')
  })

  it('replaces the same AI message with cumulative stream content and completes it once', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.accountId = 'U100'
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'Srobot',
          contactId: 'Urobot',
          contactName: 'WeTalk Robot',
          lastMessage: '',
          lastReceiveTime: 1000,
          contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    chatStore.setActiveSession('Srobot')

    chatStore.receiveMessage({
      messageId: 80,
      sessionId: 'Srobot',
      messageType: 14,
      messageContent: '',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 2000,
      contactId: 'U100',
    })
    expect(chatStore.initialMessages[0]?.aiStatus).toBe('waiting')

    chatStore.receiveMessage({
      messageId: 80,
      sessionId: 'Srobot',
      messageType: 15,
      messageContent: 'Hello',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 3000,
      contactId: 'U100',
    })
    chatStore.receiveMessage({
      messageId: 80,
      sessionId: 'Srobot',
      messageType: 16,
      messageContent: 'Hello from WeTalk',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 4000,
      contactId: 'U100',
    })

    expect(chatStore.initialMessages).toHaveLength(1)
    expect(chatStore.initialMessages[0]).toMatchObject({
      messageType: 14,
      messageContent: 'Hello from WeTalk',
      aiStatus: 'complete',
    })
  })

  it('maps AI cancellation and provider failures from persisted end status', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [{
          sessionId: 'Srobot', contactId: 'Urobot', contactName: 'WeTalk Robot',
          lastMessage: '', lastReceiveTime: 1000, contactType: 0,
        }],
        chatMessageList: [],
        applyCount: 0,
      },
    })
    chatStore.receiveMessage({
      messageType: 16, messageId: 83, sessionId: 'Srobot', contactId: 'U100',
      sendUserId: 'Urobot', sendUserNickName: 'WeTalk Robot', sendTime: 2000,
      messageContent: 'Partial answer', status: 2,
    })
    chatStore.receiveMessage({
      messageType: 16, messageId: 84, sessionId: 'Srobot', contactId: 'U100',
      sendUserId: 'Urobot', sendUserNickName: 'WeTalk Robot', sendTime: 3000,
      messageContent: '', status: 3,
    })

    expect(chatStore.initialMessages.map(({ aiStatus, status }) => ({ aiStatus, status }))).toEqual([
      { aiStatus: 'cancelled', status: 2 },
      { aiStatus: 'failed', status: 3 },
    ])
    expect(chatStore.sessionList[0]?.lastMessage).toContain('AI 生成失败，请重试')
  })

  it('marks an AI response interrupted when its stream stops before the timeout', () => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    chatStore.receiveMessage({
      messageType: 14,
      messageId: 81,
      sessionId: 'Srobot',
      contactId: 'U100',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 2000,
      messageContent: '',
    })

    vi.advanceTimersByTime(30_000)

    expect(chatStore.initialMessages[0]?.aiStatus).toBe('interrupted')
    vi.useRealTimers()
  })

  it('keeps partial AI output when an INIT refresh still contains an empty placeholder', () => {
    setActivePinia(createPinia())
    const chatStore = useChatStore()
    const session = {
      sessionId: 'Srobot',
      contactId: 'Urobot',
      contactName: 'WeTalk Robot',
      lastMessage: '',
      lastReceiveTime: 1000,
      contactType: 0,
    }
    chatStore.receiveMessage({ messageType: 0, extentData: { chatSessionList: [session], chatMessageList: [], applyCount: 0 } })
    chatStore.receiveMessage({
      messageId: 82,
      sessionId: 'Srobot',
      messageType: 14,
      messageContent: '',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 2000,
      contactId: 'U100',
    })
    chatStore.receiveMessage({
      messageId: 82,
      sessionId: 'Srobot',
      messageType: 15,
      messageContent: 'Partial reply',
      sendUserId: 'Urobot',
      sendUserNickName: 'WeTalk Robot',
      sendTime: 3000,
      contactId: 'U100',
    })
    chatStore.receiveMessage({
      messageType: 0,
      extentData: {
        chatSessionList: [session],
        chatMessageList: [{
          messageId: 82,
          sessionId: 'Srobot',
          messageType: 14,
          messageContent: '',
          sendUserId: 'Urobot',
          sendUserNickName: 'WeTalk Robot',
          sendTime: 2000,
          contactId: 'U100',
        }],
        applyCount: 0,
      },
    })

    expect(chatStore.initialMessages[0]).toMatchObject({ messageContent: 'Partial reply', aiStatus: 'streaming' })
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
