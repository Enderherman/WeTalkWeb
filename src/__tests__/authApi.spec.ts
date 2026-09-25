import { describe, expect, it } from 'vitest'
import { hashLoginPassword } from '@/api/auth'

describe('auth API compatibility', () => {
  it('uses the password digest expected by the current backend login endpoint', () => {
    expect(hashLoginPassword('password')).toBe('5f4dcc3b5aa765d61d8327deb882cf99')
  })
})
