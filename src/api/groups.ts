import { postForm, postMultipart } from '@/api/http'
import type { GroupProfile } from '@/api/contacts'

export interface SaveGroupInput {
  groupName: string
  groupNotice: string
  joinType: 0 | 1
  avatarFile: File
}

export interface UpdateGroupInput {
  groupId: string
  groupName: string
  groupNotice: string
  joinType: 0 | 1
  avatarFile?: File | null
}

export interface GroupMember {
  userId: string
  contactId: string
  contactName?: string | null
  sex?: number | null
}

export interface GroupInfoWithMembers {
  groupInfo: Omit<GroupProfile, 'memberCount'> & { memberCount?: number | null }
  userContactList: GroupMember[]
}

export type GroupMemberOperation = 0 | 1

export const groupApi = {
  create: (input: SaveGroupInput): Promise<null> => {
    const body = new FormData()
    body.set('groupName', input.groupName)
    body.set('groupNotice', input.groupNotice)
    body.set('joinType', String(input.joinType))
    body.set('avatarFile', input.avatarFile)
    return postMultipart<null>('/group/saveGroup', body)
  },
  update: (input: UpdateGroupInput): Promise<null> => {
    const body = new FormData()
    body.set('groupId', input.groupId)
    body.set('groupName', input.groupName)
    body.set('groupNotice', input.groupNotice)
    body.set('joinType', String(input.joinType))
    if (input.avatarFile) body.set('avatarFile', input.avatarFile)
    return postMultipart<null>('/group/saveGroup', body)
  },
  getInfoForChat: (groupId: string): Promise<GroupInfoWithMembers> =>
    postForm<GroupInfoWithMembers>('/group/getGroupInfo4Chat', { groupId }),
  manageMembers: (groupId: string, userIds: string[], opType: GroupMemberOperation): Promise<string> =>
    postForm<string>('/group/addOrRemoveGroupUser', { groupId, selectContacts: userIds.join(','), opType }),
  leaveGroup: (groupId: string): Promise<string> =>
    postForm<string>('/group/leaveGroup', { groupId }),
  dissolveGroup: (groupId: string): Promise<null> =>
    postForm<null>('/group/dissolutionGroup', { groupId }),
}
