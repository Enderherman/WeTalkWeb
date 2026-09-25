export const AUTH_EXPIRED_EVENT = 'wetalk:auth-expired'

export function notifySessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}
