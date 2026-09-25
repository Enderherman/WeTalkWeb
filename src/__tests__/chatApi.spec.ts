import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm } from '@/api/http'
import { chatApi } from '@/api/chat'

vi.mock('@/api/http', () => ({ postForm: vi.fn() }))

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
})
