import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { clearDownloadPreference, loadDownloadPreference, saveDownloadPreference } from '@/storage/downloadPreferences'

const accountId = 'download-preference-test-account'

afterEach(async () => {
  await clearDownloadPreference(accountId)
})

describe('download preference storage', () => {
  it('persists preferences per account without storing an absolute path', async () => {
    await saveDownloadPreference({ accountId, mode: 'ask' })

    await expect(loadDownloadPreference(accountId)).resolves.toEqual({ accountId, mode: 'ask' })
    await expect(loadDownloadPreference('another-account')).resolves.toBeNull()
  })
})
