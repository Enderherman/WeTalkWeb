import type { InitialChatMessage } from '@/stores/chat'

const timeGroupGapMs = 5 * 60 * 1000

export function shouldShowMessageTime(
  message: Pick<InitialChatMessage, 'sendTime'>,
  previous?: Pick<InitialChatMessage, 'sendTime'>,
) {
  if (!previous) return true
  const currentDate = new Date(message.sendTime)
  const previousDate = new Date(previous.sendTime)
  const isNewDay =
    currentDate.getFullYear() !== previousDate.getFullYear() ||
    currentDate.getMonth() !== previousDate.getMonth() ||
    currentDate.getDate() !== previousDate.getDate()
  return isNewDay || message.sendTime - previous.sendTime >= timeGroupGapMs
}

export function formatMessageTimeDivider(sendTime: number, now = new Date()): string {
  const messageDate = new Date(sendTime)
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  const time = `${String(messageDate.getHours()).padStart(2, '0')}:${String(messageDate.getMinutes()).padStart(2, '0')}`

  if (messageDay === today) return `今天 ${time}`
  if (messageDay === yesterday) return `昨天 ${time}`
  return `${messageDate.getFullYear()}年${messageDate.getMonth() + 1}月${messageDate.getDate()}日 ${time}`
}
