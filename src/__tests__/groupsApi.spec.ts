import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postForm, postMultipart } from '@/api/http'
import { groupApi } from '@/api/groups'

vi.mock('@/api/http', () => ({ postForm: vi.fn(), postMultipart: vi.fn() }))

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

  it('updates group details without requiring a new avatar', async () => {
    vi.mocked(postMultipart).mockResolvedValue(null)

    await expect(groupApi.update({
      groupId: 'G300',
      groupName: 'Renamed Group',
      groupNotice: 'Updated notice',
      joinType: 0,
    })).resolves.toBeNull()

    const [path, body] = vi.mocked(postMultipart).mock.calls[0]!
    expect(path).toBe('/group/saveGroup')
    expect(body.get('groupId')).toBe('G300')
    expect(body.get('groupName')).toBe('Renamed Group')
    expect(body.get('groupNotice')).toBe('Updated notice')
    expect(body.get('joinType')).toBe('0')
    expect(body.has('avatarFile')).toBe(false)
  })

  it('includes a replacement avatar when provided during a group update', async () => {
    vi.mocked(postMultipart).mockResolvedValue(null)
    const avatarFile = new File(['png'], 'new-avatar.png', { type: 'image/png' })

    await groupApi.update({
      groupId: 'G300',
      groupName: 'Renamed Group',
      groupNotice: '',
      joinType: 1,
      avatarFile,
    })

    const [, body] = vi.mocked(postMultipart).mock.calls[0]!
    expect(body.get('avatarFile')).toBe(avatarFile)
  })

  it('loads group details and member rows for the directory', async () => {
    const details = { groupInfo: { groupId: 'G300' }, userContactList: [{ userId: 'U100', contactId: 'G300' }] }
    vi.mocked(postForm).mockResolvedValue(details)

    await expect(groupApi.getInfoForChat('G300')).resolves.toEqual(details)
    expect(postForm).toHaveBeenCalledWith('/group/getGroupInfo4Chat', { groupId: 'G300' })
  })

  it('manages group membership and group lifecycle actions', async () => {
    vi.mocked(postForm).mockResolvedValueOnce('添加成功').mockResolvedValueOnce('退群成功').mockResolvedValueOnce(null)

    await expect(groupApi.manageMembers('G300', ['U200', 'U201'], 1)).resolves.toBe('添加成功')
    await expect(groupApi.leaveGroup('G300')).resolves.toBe('退群成功')
    await expect(groupApi.dissolveGroup('G300')).resolves.toBeNull()
    expect(postForm).toHaveBeenNthCalledWith(1, '/group/addOrRemoveGroupUser', {
      groupId: 'G300',
      selectContacts: 'U200,U201',
      opType: 1,
    })
    expect(postForm).toHaveBeenNthCalledWith(2, '/group/leaveGroup', { groupId: 'G300' })
    expect(postForm).toHaveBeenNthCalledWith(3, '/group/dissolutionGroup', { groupId: 'G300' })
  })
})
