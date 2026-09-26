import { md5 } from 'js-md5'
import { postForm, postMultipart } from './http'

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

export interface UserProfile {
  userId: string
  email: string
  nickName: string
  admin: boolean
  sex?: number | null
  personalSignature?: string | null
  areaName?: string | null
  areaCode?: string | null
}

export interface SaveUserInfoInput {
  nickName?: string
  sex?: number | null
  personalSignature?: string
  areaName?: string
  areaCode?: string
  avatarFile?: File | null
  coverFile?: File | null
}

export interface LoginInput {
  email: string
  password: string
  checkCodeKey: string
  checkCode: string
}

export interface RegisterInput extends LoginInput {
  nickName: string
}

export function hashLoginPassword(password: string): string {
  return md5(password)
}

export const authApi = {
  getCaptcha: () => postForm<CaptchaData>('/account/checkCode', {}),

  register: async (input: RegisterInput): Promise<void> => {
    // The existing backend hashes the registration password itself.
    await postForm<null>('/account/register', {
      email: input.email,
      password: input.password,
      nickName: input.nickName,
      checkCodeKey: input.checkCodeKey,
      checkCode: input.checkCode,
    })
  },

  login: (input: LoginInput): Promise<WebAuthSession> =>
    postForm<WebAuthSession>('/account/webLogin', { ...input, password: hashLoginPassword(input.password) }),

  createWebSocketTicket: (): Promise<WebSocketTicket> => postForm<WebSocketTicket>('/account/webSocketTicket', {}),

  getUserInfo: (): Promise<UserProfile> => postForm<UserProfile>('/account/getUserInfo', {}),

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
