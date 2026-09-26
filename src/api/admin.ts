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
}
