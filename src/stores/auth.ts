import { defineStore } from 'pinia'

const storageKey = 'wetalk-web.session.v1'

export interface AuthSession {
  token: string
  userId: string
  email: string
  nickName: string
  admin: boolean
}

export function readStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null

  try {
    const value = window.sessionStorage.getItem(storageKey)
    if (!value) return null
    const session = JSON.parse(value) as Partial<AuthSession>
    if (typeof session.token !== 'string' || typeof session.userId !== 'string') return null
    return {
      token: session.token,
      userId: session.userId,
      email: typeof session.email === 'string' ? session.email : '',
      nickName: typeof session.nickName === 'string' ? session.nickName : '',
      admin: Boolean(session.admin),
    }
  } catch {
    window.sessionStorage.removeItem(storageKey)
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({ session: readStoredSession() as AuthSession | null }),
  getters: {
    isAuthenticated: (state) => Boolean(state.session?.userId),
  },
  actions: {
    setSession(session: AuthSession) {
      this.session = session
      window.sessionStorage.setItem(storageKey, JSON.stringify(session))
    },
    clearSession() {
      this.session = null
      window.sessionStorage.removeItem(storageKey)
    },
  },
})
