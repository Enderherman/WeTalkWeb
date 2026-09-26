import { describe, expect, it } from 'vitest'
import { MAX_PROFILE_IMAGE_SIZE_BYTES, validateProfileImageUpload } from '@/utils/imageValidation'

describe('profile and robot image validation', () => {
  it('accepts supported image extensions when MIME type matches', () => {
    const images = [
      ['avatar.png', 'image/png'],
      ['avatar.jpg', 'image/jpeg'],
      ['avatar.jpeg', 'image/jpeg'],
      ['avatar.gif', 'image/gif'],
      ['avatar.bmp', 'image/bmp'],
      ['avatar.webp', 'image/webp'],
    ] as const

    for (const [name, type] of images) {
      expect(validateProfileImageUpload({ name, type, size: 1 })).toBeNull()
    }
  })

  it('rejects unsupported formats, MIME mismatches, empty files, and files over 10 MiB', () => {
    expect(validateProfileImageUpload({ name: 'avatar.exe', type: 'application/octet-stream', size: 1 })).toContain('PNG')
    expect(validateProfileImageUpload({ name: 'avatar.png', type: 'image/jpeg', size: 1 })).toContain('PNG')
    expect(validateProfileImageUpload({ name: 'avatar.png', type: 'image/png', size: 0 })).toContain('不能为空')
    expect(
      validateProfileImageUpload({ name: 'avatar.png', type: 'image/png', size: MAX_PROFILE_IMAGE_SIZE_BYTES + 1 }),
    ).toContain('10 MiB')
  })
})
