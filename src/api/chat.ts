import { postForm } from '@/api/http'
import type { ChatHistoryPage, InitialChatMessage } from '@/stores/chat'

export const chatApi = {
  sendTextMessage: (contactId: string, messageContent: string): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent,
      messageType: 2,
    }),
  loadHistory: (
    contactId: string,
    beforeMessageId: number | null = null,
    pageSize = 30,
  ): Promise<ChatHistoryPage> =>
    postForm<ChatHistoryPage>('/chat/loadHistory', { contactId, beforeMessageId, pageSize }),
}
