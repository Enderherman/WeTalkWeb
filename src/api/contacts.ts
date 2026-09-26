import { postForm } from '@/api/http'

export interface ContactSearchResult {
  contactId: string
  contactType: 'USER' | 'GROUP'
  nickName?: string | null
  status: number | null
  statusName?: string | null
  sex?: number | null
  areaName?: string | null
}

export interface ContactApplication {
  applyId: number
  applyUserId: string
  receiveUserId: string
  contactType: 0 | 1
  contactId: string
  lastApplyTime: number
  status: 0 | 1 | 2 | 3
  applyInfo?: string | null
  statusName?: string | null
  contactName?: string | null
}

export interface ContactApplicationsPage {
  totalCount: number
  pageSize: number
  pageNo: number
  pageTotal: number
  list: ContactApplication[]
}

export type ContactApplicationDecision = 1 | 2 | 3

export interface UserContactEntry {
  userId: string
  contactId: string
  contactType: 0 | 1
  status: number
  contactName?: string | null
  sex?: number | null
  memberCount?: number | null
}

export interface ContactProfile {
  userId: string
  nickName?: string | null
  sex?: number | null
  personalSignature?: string | null
  areaName?: string | null
  contactStatus?: number | null
}

export interface GroupProfile {
  groupId: string
  groupName: string
  groupOwnId: string
  createTime?: string | null
  groupNotice?: string | null
  joinType: 0 | 1
  status: number
  memberCount: number
}

export const contactApi = {
  search: (contactId: string): Promise<ContactSearchResult | null> =>
    postForm<ContactSearchResult | null>('/contact/search', { contactId }),
  applyAdd: (contactId: string, applyInfo = ''): Promise<number | null> =>
    postForm<number | null>('/contact/applyAdd', { contactId, applyInfo }),
  loadApplications: (pageNo = 1): Promise<ContactApplicationsPage> =>
    postForm<ContactApplicationsPage>('/contact/loadApply', { pageNo }),
  handleApplication: (applyId: number, status: ContactApplicationDecision): Promise<null> =>
    postForm<null>('/contact/dealWithApply', { applyId, status }),
  loadContacts: (contactType: 'USER' | 'GROUP' = 'USER'): Promise<UserContactEntry[]> =>
    postForm<UserContactEntry[]>('/contact/loadContact', { contactType }),
  loadOwnedGroups: (): Promise<GroupProfile[]> =>
    postForm<GroupProfile[]>('/group/loadMyGroup', {}),
  getContactUserInfo: (contactId: string): Promise<ContactProfile> =>
    postForm<ContactProfile>('/contact/getContactUserInfo', { contactId }),
  getGroupInfo: (groupId: string): Promise<GroupProfile> =>
    postForm<GroupProfile>('/group/getGroupInfo', { groupId }),
  deleteContact: (contactId: string): Promise<null> =>
    postForm<null>('/contact/delContact', { contactId }),
  blockContact: (contactId: string): Promise<null> =>
    postForm<null>('/contact/addContact2BlackList', { contactId }),
}
