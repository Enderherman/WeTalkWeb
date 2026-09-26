import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { postForm } from '@/api/http'
import { DEFAULT_SYSTEM_SETTINGS } from '@/api/systemSettings'
import { useSystemSettingsStore } from '@/stores/systemSettings'

vi.mock('@/api/http', () => ({
  postForm: vi.fn(),
  postMultipart: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
})

describe('system settings store', () => {
  it('loads the shared user settings endpoint and exposes them to the app', async () => {
    const serverSettings = { ...DEFAULT_SYSTEM_SETTINGS, maxImageSize: 24, maxGroupMemberCount: 12 }
    vi.mocked(postForm).mockResolvedValue(serverSettings)
    const store = useSystemSettingsStore()

    await Promise.all([store.load(), store.load()])

    expect(postForm).toHaveBeenCalledOnce()
    expect(postForm).toHaveBeenCalledWith('/account/getSysSetting', {})
    expect(store.settings).toEqual(serverSettings)
    expect(store.loaded).toBe(true)

    store.reset()
    expect(store.settings).toEqual(DEFAULT_SYSTEM_SETTINGS)
    expect(store.loaded).toBe(false)
  })
})
