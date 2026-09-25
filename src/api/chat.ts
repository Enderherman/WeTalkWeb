import { postForm } from '@/api/http'
import type { InitialChatMessage } from '@/stores/chat'

export const chatApi = {
  sendTextMessage: (contactId: string, messageContent: string): Promise<InitialChatMessage> =>
    postForm<InitialChatMessage>('/chat/sendMessage', {
      contactId,
      messageContent,
      messageType: 2,
    }),
}
