import { postMultipart } from '@/api/http'

export interface SaveGroupInput {
  groupName: string
  groupNotice: string
  joinType: 0 | 1
  avatarFile: File
}

export const groupApi = {
  create: (input: SaveGroupInput): Promise<null> => {
    const body = new FormData()
    body.set('groupName', input.groupName)
    body.set('groupNotice', input.groupNotice)
    body.set('joinType', String(input.joinType))
    body.set('avatarFile', input.avatarFile)
    return postMultipart<null>('/group/saveGroup', body)
  },
}
