import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { InitialChatMessage } from '@/stores/chat'
import { TextMessageCache } from '@/storage/textMessageCache'

const openCaches: TextMessageCache[] = []

function createCache(name = `we-talk-test-${Math.random().toString(16).slice(2)}`) {
  const cache = new TextMessageCache(name, indexedDB)
  openCaches.push(cache)
  return cache
}

function textMessage(messageId: number, sessionId: string, sendTime: number): InitialChatMessage {
  return {
    messageId,
    sessionId,
    messageType: 2,
    messageContent: `Message ${messageId}`,
    sendUserId: 'U200',
    sendUserNickName: 'Friend',
    sendTime,
    contactId: 'U100',
  }
}

afterEach(() => {
  for (const cache of openCaches.splice(0)) cache.close()
})

describe('text-only IndexedDB cache', () => {
  it('isolates cached text by account and session and returns the newest page in display order', async () => {
    const cache = createCache()
    await cache.saveTextMessages('U100', [
      textMessage(1, 'S1', 1000),
      textMessage(2, 'S1', 2000),
      textMessage(3, 'S1', 3000),
      textMessage(4, 'S2', 4000),
      textMessage(5, 'S1', 1500),
    ])
    await cache.saveTextMessages('U200', [textMessage(6, 'S1', 6000)])

    const latest = await cache.getLatestTextMessages('U100', 'S1', 2)

    expect(latest.map((message) => message.messageId)).toEqual([3, 5])
    expect(await cache.getLatestTextMessages('U100', 'S2', 10)).toHaveLength(1)
    expect((await cache.getLatestTextMessages('U200', 'S1', 10))[0]?.messageId).toBe(6)
    expect(latest[0]).not.toHaveProperty('accountId')
    expect(latest[0]).not.toHaveProperty('fileSize')
  })

  it('ignores non-text messages and clears only the selected account cache', async () => {
    const cache = createCache()
    const attachment = { ...textMessage(2, 'S1', 2000), messageType: 5 } as InitialChatMessage
    await cache.saveTextMessages('U100', [textMessage(1, 'S1', 1000), attachment])
    await cache.saveTextMessages('U200', [textMessage(3, 'S1', 3000)])

    await cache.clearAccount('U100')

    expect(await cache.getLatestTextMessages('U100', 'S1')).toEqual([])
    expect((await cache.getLatestTextMessages('U200', 'S1'))[0]?.messageId).toBe(3)
  })

  it('persists pending text per account in send order and deletes it with that account cache', async () => {
    const databaseName = `we-talk-test-pending-${Math.random().toString(16).slice(2)}`
    const cache = createCache(databaseName)
    const pending = (clientMessageId: string, content: string, createdAt: number) => ({
      clientMessageId,
      sessionId: 'S1',
      contactId: 'U200',
      messageContent: content,
      createdAt,
    })

    await cache.savePendingTextMessage('U100', pending('later-key', 'Later', 2000))
    await cache.savePendingTextMessage('U100', pending('earlier-key', 'Earlier', 1000))
    await cache.savePendingTextMessage('U200', pending('other-account-key', 'Private', 500))

    cache.close()
    await Promise.resolve()
    const reopened = createCache(databaseName)

    expect((await reopened.getPendingTextMessages('U100')).map((message) => message.messageContent)).toEqual(['Earlier', 'Later'])
    await reopened.deletePendingTextMessage('U100', 'earlier-key')
    expect((await reopened.getPendingTextMessages('U100')).map((message) => message.clientMessageId)).toEqual(['later-key'])

    await reopened.clearAccount('U100')

    expect(await reopened.getPendingTextMessages('U100')).toEqual([])
    expect((await reopened.getPendingTextMessages('U200'))[0]?.messageContent).toBe('Private')
  })

  it('upgrades the existing version-2 cache and preserves its message and pending stores', async () => {
    const databaseName = `we-talk-test-v2-${Math.random().toString(16).slice(2)}`
    const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2)
      request.onupgradeneeded = () => {
        const db = request.result
        const messages = db.createObjectStore('messages', { keyPath: ['accountId', 'sessionId', 'messageId'] })
        messages.createIndex('byAccount', 'accountId', { unique: false })
        messages.createIndex('byAccountSessionTime', ['accountId', 'sessionId', 'sendTime'], { unique: false })
        const pending = db.createObjectStore('pending_messages', { keyPath: ['accountId', 'clientMessageId'] })
        pending.createIndex('byAccount', 'accountId', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = oldDatabase.transaction(['messages', 'pending_messages'], 'readwrite')
    transaction.objectStore('messages').put({
      accountId: 'U100', ...textMessage(25, 'S1', 2500),
    })
    transaction.objectStore('pending_messages').put({
      accountId: 'U100', clientMessageId: 'old-cache-key', sessionId: 'S1',
      contactId: 'U200', messageContent: 'Pending before upgrade', createdAt: 2600,
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    oldDatabase.close()

    const upgraded = createCache(databaseName)
    expect((await upgraded.getLatestTextMessages('U100', 'S1'))[0]?.messageId).toBe(25)
    expect((await upgraded.getPendingTextMessages('U100'))[0]?.clientMessageId).toBe('old-cache-key')
  })

  it('caches completed AI text but skips empty placeholders and stream frames', async () => {
    const cache = createCache()
    const aiReply = { ...textMessage(10, 'Srobot', 10_000), messageType: 14, messageContent: 'Hello from WeTalk', aiStatus: 'complete' as const }
    const placeholder = { ...aiReply, messageId: 11, messageContent: '' }
    const streamFrame = { ...aiReply, messageId: 12, messageType: 15, aiStatus: 'streaming' as const }

    await cache.saveTextMessages('U100', [aiReply, placeholder, streamFrame])

    const saved = await cache.getLatestTextMessages('U100', 'Srobot')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ messageId: 10, messageType: 14, messageContent: 'Hello from WeTalk', aiStatus: 'complete' })
  })

  it('retains the stopped status for a partial AI response in local cache', async () => {
    const cache = createCache()
    const stoppedReply = {
      ...textMessage(13, 'Srobot', 13_000),
      messageType: 14,
      messageContent: 'Partial answer',
      aiStatus: 'cancelled' as const,
      status: 2,
    }

    await cache.saveTextMessages('U100', [stoppedReply])

    expect((await cache.getLatestTextMessages('U100', 'Srobot'))[0]).toMatchObject({
      messageId: 13,
      aiStatus: 'cancelled',
      status: 2,
    })
  })
})
