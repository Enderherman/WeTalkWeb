import { describe, expect, it } from 'vitest'
import { findOwnTextAcknowledgement } from '@/utils/messageAcknowledgement'

describe('server acknowledgement of a local text attempt', () => {
  const pending = { clientMessageId: 'a1b2c3d4-1234-4abc-8def-1234567890ab', sessionId: 'S1', contactId: 'U2',
    messageContent: '<quoted>\n"text"', createdAt: 1 }
  const message = { messageId: 99, messageType: 2, sessionId: 'S1', contactId: 'U2', clientMessageId: pending.clientMessageId,
    messageContent: '&lt;quoted&gt;<br>&quot;text&quot;', sendUserId: 'U1', sendUserNickName: 'Me', sendTime: 2, status: 1 }

  it('matches only the same sender, idempotency key, conversation and server-confirmed content', () => {
    expect(findOwnTextAcknowledgement([message], pending, 'U1')).toBe(message)
    for (const changed of [{ sendUserId: 'U3' }, { clientMessageId: 'other' }, { contactId: 'U3' },
      { sessionId: 'S2' }, { messageContent: 'other content' }, { status: 0 }, { messageType: 5 }]) {
      expect(findOwnTextAcknowledgement([{ ...message, ...changed }], pending, 'U1')).toBeUndefined()
    }
  })

  it('also accepts unescaped content while preserving literal entity text', () => {
    const literal = { ...pending, messageContent: '&lt;literal&gt;' }
    const accepted = { ...message, messageContent: literal.messageContent }
    expect(findOwnTextAcknowledgement([accepted], literal, 'U1')).toBe(accepted)
  })
})
