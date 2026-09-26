import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENT_SIZE_BYTES, validateOrdinaryFile } from '@/utils/fileValidation'

describe('ordinary file validation', () => {
  it('allows a normal document up to the configured client limit', () => {
    expect(validateOrdinaryFile({ name: 'notes.txt', size: MAX_ATTACHMENT_SIZE_BYTES })).toBeNull()
  })

  it('rejects empty files and files above the 500 MB request limit', () => {
    expect(validateOrdinaryFile({ name: 'empty.txt', size: 0 })).toBe('空文件无法发送')
    expect(validateOrdinaryFile({ name: 'large.zip', size: MAX_ATTACHMENT_SIZE_BYTES + 1 })).toBe(
      '普通文件不能超过 500 MB',
    )
  })

  it('rejects empty or overlong file names', () => {
    expect(validateOrdinaryFile({ name: '  ', size: 1 })).toContain('文件名不能为空')
    expect(validateOrdinaryFile({ name: 'a'.repeat(201) + '.txt', size: 1 })).toContain('200')
  })

  it('rejects image and audio/video extensions until their preview slice is implemented', () => {
    expect(validateOrdinaryFile({ name: 'photo.PNG', size: 1 })).toContain('图片和音视频')
    expect(validateOrdinaryFile({ name: 'recording.mp3', size: 1 })).toContain('图片和音视频')
    expect(validateOrdinaryFile({ name: 'movie.MP4', size: 1 })).toContain('图片和音视频')
  })

  it('rejects extensions outside the backend safe extension pattern', () => {
    expect(validateOrdinaryFile({ name: 'archive.' + 'x'.repeat(17), size: 1 })).toContain(
      '扩展名格式',
    )
  })
})
