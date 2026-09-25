import { md5 } from 'js-md5'
import { postForm } from './http'

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

export interface UserProfile {
  userId: string
  email: string
  nickName: string
  admin: boolean
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

  login: (input: LoginInput): Promise<AuthUser> =>
    // Match the current Electron client contract: login sends an MD5 digest.
    postForm<AuthUser>('/account/login', { ...input, password: hashLoginPassword(input.password) }),

  getUserInfo: (): Promise<UserProfile> => postForm<UserProfile>('/account/getUserInfo', {}),

  updatePassword: async (password: string): Promise<void> => {
    // The backend expects the new raw password here and hashes it server-side.
    await postForm<null>('/account/updatePassword', { password })
  },

  logout: async (): Promise<void> => {
    await postForm<null>('/account/logout', {})
  },
}
