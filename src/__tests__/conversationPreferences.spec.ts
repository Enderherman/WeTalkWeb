import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConversationPreferencesStore } from '@/stores/conversationPreferences'

const session = { sessionId: 'S1', contactId: 'U2', contactName: 'Friend', contactType: 0, lastMessage: 'Hello', lastReceiveTime: 100 }

describe('local conversation preferences', () => {
  beforeEach(() => { window.localStorage.clear(); setActivePinia(createPinia()) })
  afterEach(() => vi.restoreAllMocks())

  it('persists pins and removed chats per account, retaining the server session', () => {
    const store = useConversationPreferencesStore()
    store.load('U1')
    store.togglePin('S1')
    store.hide(session)
    store.load('U2')
    expect(store.pinned).toEqual([])
    expect(store.isHidden(session)).toBe(false)
    store.load('U1')
    expect(store.pinned).toEqual(['S1'])
    expect(store.isHidden(session)).toBe(true)
    store.restore('S1')
    expect(store.isHidden(session)).toBe(false)
  })

  it('restores a removed conversation on new activity and persists that restoration', () => {
    const store = useConversationPreferencesStore()
    store.load('U1')
    store.hide(session)
    store.restoreUpdated([{ ...session, lastMessage: 'New message', lastReceiveTime: 200 }])
    store.load('U1')
    expect(store.hidden).toEqual({})
  })

  it('keeps the current page usable when local storage is unavailable', () => {
    const store = useConversationPreferencesStore()
    store.load('U1')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    store.togglePin('S1')
    expect(store.pinned).toEqual(['S1'])
    expect(store.storageError).toContain('当前页面')
  })
})
