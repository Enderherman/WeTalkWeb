import { md5 } from 'js-md5'
import { postForm, postMultipart } from './http'
import type { SystemSettings } from './systemSettings'

export interface CaptchaData {
  check_code: string
  check_code_key: string
}

export interface AuthUser {
  token: string
  userId: string
  email: string
  nickName: string
  admin: boolean
}

export interface WebAuthSession {
  userId: string
  email: string
  nickName: string
  admin: boolean
}

export interface WebSocketTicket {
  ticket: string
}

export interface UserSessionInfo {
  sessionId: string
  deviceName: string
  deviceType?: 'desktop' | 'browser' | null
  createdAt: number
  lastActiveAt: number
  current: boolean
}

export interface RevokedSessionsResult {
  revokedCount: number
}

export interface UserProfile {
  userId: string
  email: string
  nickName: string
  admin: boolean
  sex?: number | null
  personalSignature?: string | null
  areaName?: string | null
  areaCode?: string | null
  joinType?: 0 | 1 | null
}

export interface SaveUserInfoInput {
  nickName?: string
  sex?: number | null
  personalSignature?: string
  areaName?: string
  areaCode?: string
  joinType?: 0 | 1
  avatarFile?: File | null
  coverFile?: File | null
}

export interface LoginInput {
  email: string
  password: string
  checkCodeKey: string
  checkCode: string
}

export interface RegistrationEmailCodeInput {
  email: string
  checkCodeKey: string
  checkCode: string
}

export interface RegisterInput {
  email: string
  nickName: string
  password: string
  emailCode: string
}

export function hashLoginPassword(password: string): string {
  return md5(password)
}

export const authApi = {
  getCaptcha: () => postForm<CaptchaData>('/account/checkCode', {}),

  sendRegistrationEmailCode: async (input: RegistrationEmailCodeInput): Promise<void> => {
    await postForm<null>('/account/registerEmailCode', {
      email: input.email,
      checkCodeKey: input.checkCodeKey,
      checkCode: input.checkCode,
    })
  },

  register: async (input: RegisterInput): Promise<void> => {
    // The existing backend hashes the registration password itself.
    await postForm<null>('/account/register', {
      email: input.email,
      password: input.password,
      nickName: input.nickName,
      emailCode: input.emailCode,
    })
  },

  login: (input: LoginInput): Promise<WebAuthSession> =>
    postForm<WebAuthSession>('/account/webLogin', { ...input, password: hashLoginPassword(input.password) }),

  createWebSocketTicket: (): Promise<WebSocketTicket> =>
    postForm<WebSocketTicket>('/account/webSocketTicket', {}, { availability: 'local' }),

  listSessions: (): Promise<UserSessionInfo[]> => postForm<UserSessionInfo[]>('/account/listSessions', {}),

  revokeSession: async (sessionId: string): Promise<void> => {
    await postForm<null>('/account/revokeSession', { sessionId })
  },

  revokeOtherSessions: (): Promise<RevokedSessionsResult> =>
    postForm<RevokedSessionsResult>('/account/revokeOtherSessions', {}),

  getUserInfo: (): Promise<UserProfile> => postForm<UserProfile>('/account/getUserInfo', {}),

  getSystemSettings: (): Promise<SystemSettings> => postForm<SystemSettings>('/account/getSysSetting', {}),

  saveUserInfo: (input: SaveUserInfoInput): Promise<UserProfile> => {
    const body = new FormData()
    for (const [key, value] of Object.entries(input)) {
      if (value === null || value === undefined) continue
      if (key === 'avatarFile' || key === 'coverFile') body.set(key, value as File)
      else body.set(key, String(value))
    }
    return postMultipart<UserProfile>('/account/saveUserInfo', body)
  },

  updatePassword: async (password: string): Promise<void> => {
    // The backend expects the new raw password here and hashes it server-side.
    await postForm<null>('/account/updatePassword', { password })
  },

  logout: async (): Promise<void> => {
    await postForm<null>('/account/logout', {})
  },
}
