import { describe, expect, it } from 'vitest'
import { createClientMessageId } from '@/utils/clientMessageId'

describe('client message identifiers', () => {
  it('uses crypto.randomUUID when the browser provides it', () => {
    const cryptoApi = {
      randomUUID: () => '12345678-1234-4234-8234-123456789abc',
      getRandomValues: (array: Uint8Array) => array,
    } as unknown as Crypto

    expect(createClientMessageId(cryptoApi)).toBe('12345678-1234-4234-8234-123456789abc')
  })

  it('creates a UUID v4 with getRandomValues when randomUUID is unavailable', () => {
    const cryptoApi = {
      getRandomValues: (array: Uint8Array) => {
        array.fill(0xab)
        return array
      },
    } as unknown as Crypto

    expect(createClientMessageId(cryptoApi)).toBe('abababab-abab-4bab-abab-abababababab')
  })
})
