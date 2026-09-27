import { postDownload, postForm, postMultipart } from '@/api/http'
import type { ServerMessage } from '@/api/realtime'
import type { ChatHistoryPage, InitialChatMessage } from '@/stores/chat'

export const chatApi = {
  sendTextMessage: (
    contactId: string,
    messageContent: string,
    clientMessageId?: string,
  ): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent,
      messageType: 2,
      ...(clientMessageId ? { clientMessageId } : {}),
    }),
  cancelAiMessage: (messageId: number): Promise<ServerMessage> =>
    postForm<ServerMessage>('/chat/cancelAiMessage', { messageId }),
  sendFileMessage: (contactId: string, file: File, fileType: 0 | 1 | 2 = 2): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent: fileType === 0 ? '[图片]' : fileType === 1 ? '[媒体]' : '[文件]',
      messageType: 5,
      fileSize: file.size,
      fileName: file.name,
      fileType,
    }),
  uploadFile: (
    messageId: number,
    file: File,
    onProgress?: (percent: number) => void,
    cover?: File | null,
  ): Promise<string> => {
    const body = new FormData()
    body.set('messageId', String(messageId))
    body.set('file', file)
    if (cover) body.set('cover', cover)
    return postMultipart<string>('/chat/uploadFile', body, {
      timeoutMs: 0,
      onUploadProgress: onProgress,
    })
  },
  streamMediaUrl: (messageId: number): string | null => {
    if (!Number.isSafeInteger(messageId) || messageId < 1 || typeof window === 'undefined') return null
    try {
      const baseUrl = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
      if (baseUrl.origin !== window.location.origin) return null
      const basePath = baseUrl.pathname.replace(/\/+$/, '')
      return `${basePath}/chat/streamMedia?fileId=${encodeURIComponent(String(messageId))}`
    } catch {
      return null
    }
  },
  downloadFile: (fileId: string | number, showCover = false): Promise<Blob> =>
    postDownload('/chat/downloadFile', { fileId, showCover }),
  loadHistory: (
    contactId: string,
    beforeMessageId: number | null = null,
    pageSize = 30,
  ): Promise<ChatHistoryPage> =>
    postForm<ChatHistoryPage>('/chat/loadHistory', { contactId, beforeMessageId, pageSize }),
  markRead: (contactId: string, messageId: number): Promise<unknown> =>
    postForm('/chat/markRead', { contactId, messageId }),
}
