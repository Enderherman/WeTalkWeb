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

export const contactApi = {
  search: (contactId: string): Promise<ContactSearchResult | null> =>
    postForm<ContactSearchResult | null>('/contact/search', { contactId }),
  applyAdd: (contactId: string, applyInfo = ''): Promise<number | null> =>
    postForm<number | null>('/contact/applyAdd', { contactId, applyInfo }),
}
