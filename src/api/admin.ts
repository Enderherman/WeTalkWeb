import { postForm, postMultipart } from '@/api/http'
import type { SystemSettings } from '@/api/systemSettings'

export type { SystemSettings } from '@/api/systemSettings'

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

export interface BeautyAccount {
  id: number
  email: string
  userId: string
  status: 0 | 1
}

export interface BeautyAccountPage {
  totalCount: number
  pageSize: number
  pageNo: number
  pageTotal: number
  list: BeautyAccount[]
}

export interface BeautyAccountSearch {
  pageNo?: number
  pageSize?: number
  emailFuzzy?: string
  userIdFuzzy?: string
  status?: 0 | 1
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
  saveSystemSettings: (
    settings: SystemSettings,
    robotAvatarFile?: File | null,
    robotAvatarCoverFile?: File | null,
  ): Promise<null> => {
    const values: Record<string, string | number | boolean | null | undefined> = { ...settings }
    if (robotAvatarFile || robotAvatarCoverFile) {
      const body = new FormData()
      for (const [key, value] of Object.entries(values)) {
        if (value !== null && value !== undefined) body.set(key, String(value))
      }
      if (robotAvatarFile) body.set('robotAvatarFile', robotAvatarFile)
      if (robotAvatarCoverFile) body.set('robotAvatarCoverFile', robotAvatarCoverFile)
      return postMultipart<null>('/admin/saveSystemSetting', body)
    }
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
  loadBeautyAccounts: (query: BeautyAccountSearch = {}): Promise<BeautyAccountPage> => {
    const values: Record<string, string | number | boolean | null | undefined> = {
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      emailFuzzy: query.emailFuzzy,
      userIdFuzzy: query.userIdFuzzy,
      status: query.status,
    }
    return postForm<BeautyAccountPage>('/userInfoBeauty/loadBeautyAccountList', values)
  },
  saveBeautyAccount: (values: { id?: number; email: string; userId: string; status?: 0 | 1 }): Promise<null> =>
    postForm<null>('/userInfoBeauty/saveBeautyAccount', values),
  deleteBeautyAccount: (id: number): Promise<null> =>
    postForm<null>('/userInfoBeauty/deleteBeautyAccount', { id }),
  dissolveGroup: (groupOwnerId: string, groupId: string): Promise<null> =>
    postForm<null>('/admin/dissolutionGroup', { groupOwnerId, groupId }),
}
