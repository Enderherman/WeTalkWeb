import { postForm } from '@/api/http'

export interface AdminUser {
  userId: string
  email?: string | null
  nickName?: string | null
  status: 0 | 1
  sex?: number | null
  areaName?: string | null
  personalSignature?: string | null
  createTime?: string | null
  lastLoginTime?: string | null
  lastOffTime?: number | null
  onlineType?: number
}

export interface AdminUserPage {
  totalCount: number
  pageSize: number
  pageNo: number
  pageTotal: number
  list: AdminUser[]
}

export interface AdminUserSearch {
  pageNo?: number
  pageSize?: number
  userIdFuzzy?: string
  emailFuzzy?: string
  nickNameFuzzy?: string
}

export interface AdminGroup {
  groupId: string
  groupName: string
  groupOwnId: string
  groupOwnerNickName?: string | null
  memberCount?: number | null
  status: number
  joinType?: number | null
  createTime?: string | null
  groupNotice?: string | null
}

export interface AdminGroupPage {
  totalCount: number
  pageSize: number
  pageNo: number
  pageTotal: number
  list: AdminGroup[]
}

export interface AdminGroupSearch {
  pageNo?: number
  pageSize?: number
  groupIdFuzzy?: string
  groupNameFuzzy?: string
  groupOwnIdFuzzy?: string
}

export interface SystemSettings {
  maxGroupCount: number
  maxGroupMemberCount: number
  maxImageSize: number
  maxVideoSize: number
  maxFileSize: number
  robotUid: string
  robotNickName: string
  robotWelcome: string
}

export const adminApi = {
  loadUsers: (query: AdminUserSearch = {}): Promise<AdminUserPage> => {
    const values: Record<string, string | number | boolean | null | undefined> = {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      userIdFuzzy: query.userIdFuzzy,
      emailFuzzy: query.emailFuzzy,
      nickNameFuzzy: query.nickNameFuzzy,
    }
    return postForm<AdminUserPage>('/admin/loadUser', values)
  },
  updateUserStatus: (userId: string, status: 0 | 1): Promise<null> =>
    postForm<null>('/admin/updateUserStatus', { userId, status }),
  forceOffline: (userId: string): Promise<null> =>
    postForm<null>('/admin/forcedOffOnline', { userId }),
  loadSystemSettings: (): Promise<SystemSettings> => postForm<SystemSettings>('/admin/getSystemSetting', {}),
  saveSystemSettings: (settings: SystemSettings): Promise<null> => {
    const values: Record<string, string | number | boolean | null | undefined> = { ...settings }
    return postForm<null>('/admin/saveSystemSetting', values)
  },
  loadGroups: (query: AdminGroupSearch = {}): Promise<AdminGroupPage> => {
    const values: Record<string, string | number | boolean | null | undefined> = {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      groupIdFuzzy: query.groupIdFuzzy,
      groupNameFuzzy: query.groupNameFuzzy,
      groupOwnIdFuzzy: query.groupOwnIdFuzzy,
      queryGroupOwnerName: true,
      queryMemberCount: true,
    }
    return postForm<AdminGroupPage>('/admin/loadGroup', values)
  },
  dissolveGroup: (groupOwnerId: string, groupId: string): Promise<null> =>
    postForm<null>('/admin/dissolutionGroup', { groupOwnerId, groupId }),
}
