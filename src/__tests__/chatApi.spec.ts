import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postDownload, postForm, postMultipart } from '@/api/http'
import { chatApi } from '@/api/chat'

vi.mock('@/api/http', () => ({ postDownload: vi.fn(), postForm: vi.fn(), postMultipart: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('chat API', () => {
  it('uploads JPEG aliases and empty browser MIME with canonical media types', async () => {
    vi.mocked(postMultipart).mockResolvedValue('上传成功')
    const image = new File(['jpeg bytes'], 'camera.mjpeg', { type: 'video/x-motion-jpeg' })
    const cover = new File(['png bytes'], 'cover.png', { type: '' })
    await chatApi.uploadFile(42, image, undefined, cover)
    const body = vi.mocked(postMultipart).mock.calls[0]![1]
    expect(body.get('file')).toMatchObject({ name: 'camera.mjpeg', type: 'image/jpeg', size: image.size })
    expect(body.get('cover')).toMatchObject({ name: 'cover.png', type: 'image/png', size: cover.size })
  })

  it('sends plain text through the existing chat message endpoint', async () => {
    const message = {
      messageId: 11,
      sessionId: 'S100',
      messageType: 2,
      messageContent: 'Hello',
      sendUserId: 'U100',
      sendUserNickName: 'Student',
      sendTime: 1000,
      contactId: 'U200',
    }
    vi.mocked(postForm).mockResolvedValue(message)

    await expect(chatApi.sendTextMessage('U200', 'Hello')).resolves.toEqual(message)
    expect(postForm).toHaveBeenCalledWith('/chat/sendMessage', {
      contactId: 'U200',
      messageContent: 'Hello',
      messageType: 2,
    }, { availability: 'local' })
  })

  it('sends a client idempotency key for retry-safe text messages', async () => {
    const clientMessageId = 'a1b2c3d4-1234-4abc-8def-1234567890ab'
    vi.mocked(postForm).mockResolvedValue({ messageId: 12 })

    await chatApi.sendTextMessage('U200', 'Hello', clientMessageId)

    expect(postForm).toHaveBeenCalledWith('/chat/sendMessage', {
      contactId: 'U200',
      messageContent: 'Hello',
      messageType: 2,
      clientMessageId,
    }, { availability: 'local' })
  })

  it('requests cancellation of an AI message using its server message ID', async () => {
    const ended = { messageType: 16, messageId: 12, status: 2 }
    vi.mocked(postForm).mockResolvedValue(ended)

    await expect(chatApi.cancelAiMessage(12)).resolves.toEqual(ended)
    expect(postForm).toHaveBeenCalledWith('/chat/cancelAiMessage', { messageId: 12 })
  })

  it('creates file-message metadata before uploading a generic file', async () => {
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    vi.mocked(postForm).mockResolvedValue({ messageId: 42 })

    await expect(chatApi.sendFileMessage('U200', file)).resolves.toEqual({ messageId: 42 })
    expect(postForm).toHaveBeenCalledWith('/chat/sendMessage', {
      contactId: 'U200',
      messageContent: '[文件]',
      messageType: 5,
      fileSize: file.size,
      fileName: 'notes.txt',
      fileType: 2,
    })
  })

  it('marks image-message metadata with the backend image file type', async () => {
    const file = new File(['image'], 'photo.png', { type: 'image/png' })
    vi.mocked(postForm).mockResolvedValue({ messageId: 43 })

    await chatApi.sendFileMessage('U200', file, 0)

    expect(postForm).toHaveBeenCalledWith('/chat/sendMessage', {
      contactId: 'U200',
      messageContent: '[图片]',
      messageType: 5,
      fileSize: file.size,
      fileName: 'photo.png',
      fileType: 0,
    })
  })

  it('marks audio/video metadata with the backend media file type', async () => {
    const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    vi.mocked(postForm).mockResolvedValue({ messageId: 44 })

    await chatApi.sendFileMessage('G300', file, 1)

    expect(postForm).toHaveBeenCalledWith('/chat/sendMessage', {
      contactId: 'G300',
      messageContent: '[媒体]',
      messageType: 5,
      fileSize: file.size,
      fileName: 'clip.mp4',
      fileType: 1,
    })
  })

  it('uploads the file with its message ID and reports upload progress', async () => {
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    const onProgress = vi.fn()
    vi.mocked(postMultipart).mockResolvedValue('上传成功')

    await expect(chatApi.uploadFile(42, file, onProgress)).resolves.toBe('上传成功')
    const [path, body, options] = vi.mocked(postMultipart).mock.calls[0]!
    expect(path).toBe('/chat/uploadFile')
    expect(body.get('messageId')).toBe('42')
    expect(body.get('file')).toBe(file)
    expect(options?.timeoutMs).toBe(0)
    expect(options?.onUploadProgress).toBe(onProgress)
  })

  it('includes an optional video cover in the multipart upload', async () => {
    const video = new File(['video bytes'], 'clip.mp4', { type: 'video/mp4' })
    const cover = new File(['png cover'], 'clip-cover.png', { type: 'image/png' })
    vi.mocked(postMultipart).mockResolvedValue('上传成功')

    await chatApi.uploadFile(45, video, undefined, cover)

    const [, body] = vi.mocked(postMultipart).mock.calls[0]!
    expect(body.get('messageId')).toBe('45')
    expect(body.get('file')).toBe(video)
    expect(body.get('cover')).toBe(cover)
  })

  it('includes an optional generated cover when uploading a video', async () => {
    const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
    const cover = new File(['png'], 'clip-cover.png', { type: 'image/png' })
    vi.mocked(postMultipart).mockResolvedValue('上传成功')

    await chatApi.uploadFile(45, video, undefined, cover)

    const [, body] = vi.mocked(postMultipart).mock.calls[0]!
    expect(body.get('messageId')).toBe('45')
    expect(body.get('file')).toBe(video)
    expect(body.get('cover')).toBe(cover)
  })

  it('downloads a message attachment as a browser Blob', async () => {
    const blob = new Blob(['file bytes'], { type: 'application/octet-stream' })
    vi.mocked(postDownload).mockResolvedValue(blob)

    await expect(chatApi.downloadFile(42)).resolves.toBe(blob)
    expect(postDownload).toHaveBeenCalledWith('/chat/downloadFile', { fileId: 42, showCover: false })
  })

  it('builds a same-origin URL for Range-enabled media playback', () => {
    expect(chatApi.streamMediaUrl(605)).toBe('/api/chat/streamMedia?fileId=605')
    expect(chatApi.streamMediaUrl(0)).toBeNull()
  })

  it('downloads user and group avatars or covers by identifier', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/png' })
    vi.mocked(postDownload).mockResolvedValue(blob)

    await expect(chatApi.downloadFile('U100')).resolves.toBe(blob)
    expect(postDownload).toHaveBeenLastCalledWith('/chat/downloadFile', { fileId: 'U100', showCover: false })

    await expect(chatApi.downloadFile('G300', true)).resolves.toBe(blob)
    expect(postDownload).toHaveBeenLastCalledWith('/chat/downloadFile', { fileId: 'G300', showCover: true })
  })


  it('requests older history using the message ID cursor', async () => {
    const page = { pageNo: 1, pageSize: 30, pageTotal: 1, totalCount: 1, list: [] }
    vi.mocked(postForm).mockResolvedValue(page)

    await expect(chatApi.loadHistory('U200', 42, 30)).resolves.toEqual(page)
    expect(postForm).toHaveBeenCalledWith('/chat/loadHistory', {
      contactId: 'U200',
      beforeMessageId: 42,
      pageSize: 30,
    })
  })

  it('passes an abort signal to paginated history requests', async () => {
    const page = { pageNo: 1, pageSize: 50, pageTotal: 1, totalCount: 0, list: [] }
    const controller = new AbortController()
    vi.mocked(postForm).mockResolvedValue(page)

    await expect(chatApi.loadHistory('U200', null, 50, controller.signal)).resolves.toEqual(page)
    expect(postForm).toHaveBeenCalledWith(
      '/chat/loadHistory',
      { contactId: 'U200', beforeMessageId: null, pageSize: 50 },
      { signal: controller.signal },
    )
  })

  it('persists a read cursor for the current conversation', async () => {
    vi.mocked(postForm).mockResolvedValue(null)

    await expect(chatApi.markRead('U200', 51)).resolves.toBeNull()
    expect(postForm).toHaveBeenCalledWith('/chat/markRead', { contactId: 'U200', messageId: 51 })
  })
})
