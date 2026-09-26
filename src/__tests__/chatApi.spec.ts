import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postDownload, postForm, postMultipart } from '@/api/http'
import { chatApi } from '@/api/chat'

vi.mock('@/api/http', () => ({ postDownload: vi.fn(), postForm: vi.fn(), postMultipart: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('chat API', () => {
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
    })
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

  it('downloads a message attachment as a browser Blob', async () => {
    const blob = new Blob(['file bytes'], { type: 'application/octet-stream' })
    vi.mocked(postDownload).mockResolvedValue(blob)

    await expect(chatApi.downloadFile(42)).resolves.toBe(blob)
    expect(postDownload).toHaveBeenCalledWith('/chat/downloadFile', { fileId: 42, showCover: false })
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
})
