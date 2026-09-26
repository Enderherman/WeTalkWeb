import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postMultipart } from '@/api/http'
import { groupApi } from '@/api/groups'

vi.mock('@/api/http', () => ({ postMultipart: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

describe('group API', () => {
  it('creates a group with multipart fields and the required PNG avatar', async () => {
    const avatarFile = new File(['png bytes'], 'avatar.png', { type: 'image/png' })
    vi.mocked(postMultipart).mockResolvedValue(null)

    await expect(groupApi.create({
      groupName: 'Study Group',
      groupNotice: 'Homework discussion',
      joinType: 1,
      avatarFile,
    })).resolves.toBeNull()

    const [path, body] = vi.mocked(postMultipart).mock.calls[0]!
    expect(path).toBe('/group/saveGroup')
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('groupName')).toBe('Study Group')
    expect(body.get('groupNotice')).toBe('Homework discussion')
    expect(body.get('joinType')).toBe('1')
    expect(body.get('avatarFile')).toBe(avatarFile)
    expect(body.has('coverFile')).toBe(false)
  })
})
