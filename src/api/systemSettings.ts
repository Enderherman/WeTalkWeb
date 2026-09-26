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

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  maxGroupCount: 5,
  maxGroupMemberCount: 500,
  maxImageSize: 200,
  maxVideoSize: 500,
  maxFileSize: 5000,
  robotUid: 'Urobot',
  robotNickName: 'WeTalk Robot',
  robotWelcome: '欢迎使用WeTalk Robot!',
}
