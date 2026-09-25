import { describe, expect, it } from 'vitest'
import { formatMessageTimeDivider, shouldShowMessageTime } from '@/utils/messageTime'

describe('message time grouping', () => {
  it('starts a group for the first message, long gaps, and a new local day', () => {
    const ten = new Date(2026, 8, 26, 10, 0).getTime()
    expect(shouldShowMessageTime({ sendTime: ten })).toBe(true)
    expect(shouldShowMessageTime({ sendTime: ten + 4 * 60 * 1000 }, { sendTime: ten })).toBe(false)
    expect(shouldShowMessageTime({ sendTime: ten + 5 * 60 * 1000 }, { sendTime: ten })).toBe(true)
    expect(shouldShowMessageTime(
      { sendTime: new Date(2026, 8, 27, 0, 1).getTime() },
      { sendTime: new Date(2026, 8, 26, 23, 59).getTime() },
    )).toBe(true)
  })

  it('labels today and yesterday in the local timezone', () => {
    const now = new Date(2026, 8, 26, 12, 30)
    expect(formatMessageTimeDivider(new Date(2026, 8, 26, 9, 5).getTime(), now)).toBe('今天 09:05')
    expect(formatMessageTimeDivider(new Date(2026, 8, 25, 18, 40).getTime(), now)).toBe('昨天 18:40')
  })

  it('labels older dates with year, month, day, and time', () => {
    const now = new Date(2026, 8, 26, 12, 30)
    expect(formatMessageTimeDivider(new Date(2026, 8, 20, 8, 7).getTime(), now)).toBe('2026年9月20日 08:07')
  })
})
