import { postDownload, postForm, postMultipart } from '@/api/http'
import type { ChatHistoryPage, InitialChatMessage } from '@/stores/chat'

export const chatApi = {
  sendTextMessage: (contactId: string, messageContent: string): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent,
      messageType: 2,
    }),
  sendFileMessage: (contactId: string, file: File, fileType: 0 | 1 | 2 = 2): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent: fileType === 0 ? '[图片]' : fileType === 1 ? '[媒体]' : '[文件]',
      messageType: 5,
      fileSize: file.size,
      fileName: file.name,
      fileType,
    }),
  uploadFile: (messageId: number, file: File, onProgress?: (percent: number) => void): Promise<string> => {
    const body = new FormData()
    body.set('messageId', String(messageId))
    body.set('file', file)
    return postMultipart<string>('/chat/uploadFile', body, {
      timeoutMs: 0,
      onUploadProgress: onProgress,
    })
  },
  downloadFile: (messageId: number): Promise<Blob> =>
    postDownload('/chat/downloadFile', { fileId: messageId, showCover: false }),
  loadHistory: (
    contactId: string,
    beforeMessageId: number | null = null,
    pageSize = 30,
  ): Promise<ChatHistoryPage> =>
    postForm<ChatHistoryPage>('/chat/loadHistory', { contactId, beforeMessageId, pageSize }),
}
