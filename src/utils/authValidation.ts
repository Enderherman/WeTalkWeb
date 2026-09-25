export type AuthMode = 'login' | 'register'

export interface AuthFormValues {
  email: string
  nickName: string
  password: string
  confirmPassword: string
  checkCode: string
}

export type AuthErrors = Partial<Record<keyof AuthFormValues, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPattern = /^(?=.*\d)(?=.*[a-zA-Z])[\da-zA-Z~!@#$%^&*_]{8,18}$/

export function validatePassword(password: string): string | null {
  if (!password) return '请输入密码'
  if (!passwordPattern.test(password)) return '密码需为 8–18 位，并包含英文字母和数字'
  return null
}

export function validateAuthForm(mode: AuthMode, values: AuthFormValues): AuthErrors {
  const errors: AuthErrors = {}
  if (!values.email.trim()) errors.email = '请输入邮箱'
  else if (!emailPattern.test(values.email.trim())) errors.email = '请输入有效的邮箱地址'

  const passwordError = validatePassword(values.password)
  if (passwordError) errors.password = passwordError

  if (!values.checkCode.trim()) errors.checkCode = '请输入图片验证码'

  if (mode === 'register') {
    if (!values.nickName.trim()) errors.nickName = '请输入昵称'
    if (values.confirmPassword !== values.password) errors.confirmPassword = '两次输入的密码不一致'
  }

  return errors
}
