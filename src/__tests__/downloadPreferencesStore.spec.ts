import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { clearDownloadPreference, loadDownloadPreference, saveDownloadPreference } from '@/storage/downloadPreferences'
import { useDownloadPreferencesStore } from '@/stores/downloadPreferences'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('download preferences store', () => {
  it('loads and saves a download mode separately for each account', async () => {
    const store = useDownloadPreferencesStore()
    await store.load('U-download-pref-a')
    expect(store.mode).toBe('browser')

    await store.setMode('browser')
    store.reset()
    await store.load('U-download-pref-a')
    expect(store.mode).toBe('browser')

    await saveDownloadPreference({ accountId: 'U-download-pref-b', mode: 'ask' })
    await store.load('U-download-pref-b')
    expect(store.mode).toBe('ask')
    expect(await loadDownloadPreference('U-download-pref-a')).toEqual({ accountId: 'U-download-pref-a', mode: 'browser' })

    await clearDownloadPreference('U-download-pref-a')
    await clearDownloadPreference('U-download-pref-b')
  })
})
