export type AuthMode = 'login' | 'register'

export interface AuthFormValues {
  email: string
  nickName: string
  password: string
  confirmPassword: string
  checkCode: string
  emailCode: string
}

export type AuthErrors = Partial<Record<keyof AuthFormValues, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const passwordPattern = /^(?=.*\d)(?=.*[a-zA-Z])[\da-zA-Z~!@#$%^&*_]{8,18}$/

export function validateEmail(email: string): string | null {
  if (!email.trim()) return '请输入邮箱'
  if (!emailPattern.test(email.trim())) return '请输入有效的邮箱地址'
  return null
}

export function validatePassword(password: string): string | null {
  if (!password) return '请输入密码'
  if (!passwordPattern.test(password)) return '密码需为 8–18 位，并包含英文字母和数字'
  return null
}

export function validateAuthForm(mode: AuthMode, values: AuthFormValues): AuthErrors {
  const errors: AuthErrors = {}
  const emailError = validateEmail(values.email)
  if (emailError) errors.email = emailError

  const passwordError = validatePassword(values.password)
  if (passwordError) errors.password = passwordError

  if (mode === 'login' && !values.checkCode.trim()) errors.checkCode = '请输入图片验证码'

  if (mode === 'register') {
    if (!values.nickName.trim()) errors.nickName = '请输入昵称'
    if (values.confirmPassword !== values.password) errors.confirmPassword = '两次输入的密码不一致'
    if (!/^\d{6}$/.test(values.emailCode.trim())) errors.emailCode = '请输入 6 位邮箱验证码'
  }

  return errors
}
