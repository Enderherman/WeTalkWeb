import { postForm, postMultipart } from '@/api/http'

export interface AppRelease {
  id: number
  version: string
  updateDesc: string
  updateDescArray?: string[]
  createTime?: string
  status: 0 | 1 | 2
  grayscaleUid?: string | null
  fileType: 0 | 1
  outerLink?: string | null
}

export interface AppReleasePage {
  list: AppRelease[]
  totalCount: number
  pageNo: number
  pageTotal: number
  pageSize: number
}

export interface SaveAppRelease {
  id?: number
  version: string
  updateDesc: string
  fileType: 0 | 1
  outerLink: string
  file?: File
}

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
  loadReleases: (pageNo = 1, pageSize = 20): Promise<AppReleasePage> =>
    postForm<AppReleasePage>('/app/loadUpdateList', { pageNo, pageSize }),
  saveRelease: (values: SaveAppRelease): Promise<null> => {
    const body = new FormData()
    if (values.id !== undefined) body.set('id', String(values.id))
    body.set('version', values.version)
    body.set('updateDesc', values.updateDesc)
    body.set('fileType', String(values.fileType))
    body.set('outerLink', values.outerLink)
    if (values.file) body.set('file', values.file)
    return postMultipart<null>('/app/saveUpdate', body, { timeoutMs: 0 })
  },
  deleteRelease: (id: number): Promise<null> => postForm<null>('/app/deleteUpdate', { id }),
  publishRelease: (id: number, status: 0 | 1 | 2, grayscaleUid = ''): Promise<null> =>
    postForm<null>('/app/postUpdate', { id, status, grayscaleUid: status === 1 ? grayscaleUid : '' }),
}
