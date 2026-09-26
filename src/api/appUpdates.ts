import { postForm } from '@/api/http'

export interface AppUpdateNotice {
  id: number
  version: string
  updateList: string[]
  size: number
  fileName: string
  fileType: 0 | 1
  outerLink: string
}

export const appUpdateApi = {
  checkForUpdate: (version: string): Promise<AppUpdateNotice | null> =>
    postForm<AppUpdateNotice | null>('/app/checkUpdate', { version }),
}
