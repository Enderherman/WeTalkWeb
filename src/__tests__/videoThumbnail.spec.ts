import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVideoCover } from '@/utils/videoThumbnail'

afterEach(() => vi.restoreAllMocks())

describe('video cover generation', () => {
  it('returns null when the browser cannot create local file URLs', async () => {
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined })
    try {
      await expect(createVideoCover(new File(['video'], 'clip.mp4', { type: 'video/mp4' }))).resolves.toBeNull()
    } finally {
      if (original) Object.defineProperty(URL, 'createObjectURL', original)
      else Reflect.deleteProperty(URL, 'createObjectURL')
    }
  })

  it('captures a bounded PNG cover and releases its temporary video URL', async () => {
    const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createObjectUrl = vi.fn(() => 'blob:local-video')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })

    const nativeCreateElement = document.createElement.bind(document)
    const video = nativeCreateElement('video')
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 })
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    vi.spyOn(video, 'load').mockImplementation(() => {})
    vi.spyOn(video, 'pause').mockImplementation(() => {})

    const drawImage = vi.fn()
    const canvas = nativeCreateElement('canvas')
    Object.defineProperty(canvas, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ drawImage }) as unknown as CanvasRenderingContext2D),
    })
    Object.defineProperty(canvas, 'toBlob', {
      configurable: true,
      value: (callback: BlobCallback) => callback(new Blob(['png-cover'], { type: 'image/png' })),
    })
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') return video
      if (tag === 'canvas') return canvas
      return nativeCreateElement(tag)
    }) as typeof document.createElement)

    try {
      const videoFile = new File(['video'], 'lecture.mp4', { type: 'video/mp4' })
      const cover = await createVideoCover(videoFile)
      const oversizedCover = await createVideoCover(videoFile, 8)

      expect(cover).toMatchObject({ name: 'lecture-cover.png', type: 'image/png' })
      expect(oversizedCover).toBeNull()
      expect(canvas.width).toBe(640)
      expect(canvas.height).toBe(360)
      expect(drawImage).toHaveBeenCalledTimes(2)
      expect(createObjectUrl).toHaveBeenCalledTimes(2)
      expect(revokeObjectUrl).toHaveBeenCalledWith('blob:local-video')
    } finally {
      if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
      else Reflect.deleteProperty(URL, 'createObjectURL')
      if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
      else Reflect.deleteProperty(URL, 'revokeObjectURL')
    }
  })
})
