import type { InitialChatMessage } from '@/stores/chat'
import type { PendingTextMessage } from '@/storage/textMessageCache'

function legacyStoredText(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r\n|\n/g, '<br>').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function findOwnTextAcknowledgement(
  messages: readonly InitialChatMessage[],
  pending: PendingTextMessage,
  accountId: string,
): InitialChatMessage | undefined {
  if (!accountId || !pending.clientMessageId) return undefined
  return messages.find(message => message.messageType === 2 && message.sendUserId === accountId
    && message.clientMessageId === pending.clientMessageId && message.sessionId === pending.sessionId
    && message.contactId === pending.contactId && (message.status === undefined || message.status === 1)
    && (message.messageContent === pending.messageContent || message.messageContent === legacyStoredText(pending.messageContent)))
}
