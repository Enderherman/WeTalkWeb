import { defineStore } from 'pinia'

const storageKey = 'wetalk-web.session.v1'
const generationKey = 'wetalk-web.session-generation.v1'

export interface AuthRequestContext {
  generation: number
  userId: string | null
  token: string | null
}

function readGeneration(): number {
  if (typeof window === 'undefined') return 0
  try {
    const value = Number(window.sessionStorage.getItem(generationKey))
    return Number.isSafeInteger(value) && value >= 0 ? value : 0
  } catch { return 0 }
}

function advanceGeneration(): number {
  const next = readGeneration() + 1
  window.sessionStorage.setItem(generationKey, String(next))
  return next
}

export function captureAuthRequestContext(): AuthRequestContext {
  const session = readStoredSession()
  return { generation: readGeneration(), userId: session?.userId ?? null, token: session?.token ?? null }
}

export function isCurrentAuthRequest(context: AuthRequestContext): boolean {
  const current = captureAuthRequestContext()
  return context.generation === current.generation && context.userId === current.userId && context.token === current.token
}

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
  state: () => ({ session: readStoredSession() as AuthSession | null, generation: readGeneration() }),
  getters: {
    isAuthenticated: (state) => Boolean(state.session?.userId),
  },
  actions: {
    setSession(session: AuthSession) {
      this.generation = advanceGeneration()
      this.session = { ...session }
      window.sessionStorage.setItem(storageKey, JSON.stringify(session))
    },
    applyProfile(profile: Pick<AuthSession, 'userId' | 'email' | 'nickName' | 'admin'>, context: AuthRequestContext): boolean {
      if (!isCurrentAuthRequest(context) || !this.session || profile.userId !== this.session.userId) return false
      this.session = {
        ...this.session,
        email: profile.email || this.session.email,
        nickName: profile.nickName || this.session.nickName,
        admin: profile.admin,
      }
      // A profile refresh is part of the same authenticated session. It must not
      // invalidate other concurrent requests belonging to this login.
      window.sessionStorage.setItem(storageKey, JSON.stringify(this.session))
      return true
    },
    clearSession() {
      this.generation = advanceGeneration()
      this.session = null
      window.sessionStorage.removeItem(storageKey)
    },
  },
})
