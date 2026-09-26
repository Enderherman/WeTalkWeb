import { describe, expect, it } from 'vitest'
import {
  getChatFileType,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  validateChatFile,
} from '@/utils/fileValidation'

describe('chat file validation', () => {
  it('allows a normal document up to the configured client limit', () => {
    expect(getChatFileType('notes.txt')).toBe(2)
    expect(validateChatFile({ name: 'notes.txt', size: MAX_ATTACHMENT_SIZE_BYTES })).toBeNull()
  })

  it('rejects empty files and files above the 500 MB request limit', () => {
    expect(validateChatFile({ name: 'empty.txt', size: 0 })).toBe('空文件无法发送')
    expect(validateChatFile({ name: 'large.zip', size: MAX_ATTACHMENT_SIZE_BYTES + 1 })).toBe(
      '普通文件不能超过 500 MB',
    )
  })

  it('rejects empty or overlong file names', () => {
    expect(validateChatFile({ name: '  ', size: 1 })).toContain('文件名不能为空')
    expect(validateChatFile({ name: 'a'.repeat(201) + '.txt', size: 1 })).toContain('200')
  })

  it('accepts images within their limit and classifies image/media extensions', () => {
    expect(getChatFileType('photo.PNG')).toBe(0)
    expect(getChatFileType('movie.MP4')).toBe(1)
    expect(validateChatFile({ name: 'photo.png', size: MAX_IMAGE_SIZE_BYTES })).toBeNull()
    expect(validateChatFile({ name: 'oversized.jpg', size: MAX_IMAGE_SIZE_BYTES + 1 })).toBe('图片不能超过 200 MB')
    expect(validateChatFile({ name: 'recording.mp3', size: 1 })).toBe('视频和音频后续接入')
  })

  it('rejects extensions outside the backend safe extension pattern', () => {
    expect(validateChatFile({ name: 'archive.' + 'x'.repeat(17), size: 1 })).toContain(
      '扩展名格式',
    )
  })
})
