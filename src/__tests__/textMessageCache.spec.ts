import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { InitialChatMessage } from '@/stores/chat'
import { TextMessageCache } from '@/storage/textMessageCache'

const openCaches: TextMessageCache[] = []

function createCache() {
  const cache = new TextMessageCache(`we-talk-test-${Math.random().toString(16).slice(2)}`, indexedDB)
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
      textMessage(5, 'S1', 5000),
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
})
