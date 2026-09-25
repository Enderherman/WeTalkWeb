import { describe, expect, it } from 'vitest'
import { validateAuthForm } from '@/utils/authValidation'

const validLogin = {
  email: 'student@example.com',
  nickName: '',
  password: 'WeTalk123',
  confirmPassword: '',
  checkCode: '9',
}

describe('validateAuthForm', () => {
  it('accepts a valid login form', () => {
    expect(validateAuthForm('login', validLogin)).toEqual({})
  })

  it('rejects an invalid email and a password outside the backend rule', () => {
    const errors = validateAuthForm('login', {
      ...validLogin,
      email: 'not-an-email',
      password: 'short',
    })
    expect(errors.email).toBe('请输入有效的邮箱地址')
    expect(errors.password).toContain('8–18')
  })

  it('requires a nickname and matching passwords for registration', () => {
    const errors = validateAuthForm('register', {
      ...validLogin,
      nickName: '',
      confirmPassword: 'Different123',
    })
    expect(errors.nickName).toBe('请输入昵称')
    expect(errors.confirmPassword).toBe('两次输入的密码不一致')
  })
})
