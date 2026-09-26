import { describe, expect, it } from 'vitest'
import {
  getChatFileType,
  getChatMediaKind,
  getChatMediaMimeType,
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
    expect(getChatFileType('song.mp3')).toBe(1)
    expect(getChatMediaKind('movie.mp4')).toBe('video')
    expect(getChatMediaKind('song.mp3')).toBe('audio')
    expect(getChatMediaMimeType('photo.PNG')).toBe('image/png')
    expect(getChatMediaMimeType('movie.mp4')).toBe('video/mp4')
    expect(getChatMediaMimeType('song.mp3')).toBe('audio/mpeg')
    expect(validateChatFile({ name: 'photo.png', size: MAX_IMAGE_SIZE_BYTES })).toBeNull()
    expect(validateChatFile({ name: 'oversized.jpg', size: MAX_IMAGE_SIZE_BYTES + 1 })).toBe('图片不能超过 200 MB')
    expect(validateChatFile({ name: 'recording.mp3', size: 1 })).toBeNull()
  })

  it('rejects extensions outside the backend safe extension pattern', () => {
    expect(validateChatFile({ name: 'archive.' + 'x'.repeat(17), size: 1 })).toContain(
      '扩展名格式',
    )
  })

  it('applies lower image, media, and file limits from system settings', () => {
    const limits = { maxImageSize: 2, maxVideoSize: 3, maxFileSize: 4 }
    const mb = 1024 * 1024

    expect(validateChatFile({ name: 'photo.png', size: 2 * mb }, limits)).toBeNull()
    expect(validateChatFile({ name: 'photo.png', size: 2 * mb + 1 }, limits)).toBe('图片不能超过 2 MB')
    expect(validateChatFile({ name: 'movie.mp4', size: 3 * mb + 1 }, limits)).toBe('音视频文件不能超过 3 MB')
    expect(validateChatFile({ name: 'archive.zip', size: 4 * mb + 1 }, limits)).toBe('普通文件不能超过 4 MB')
  })
})
