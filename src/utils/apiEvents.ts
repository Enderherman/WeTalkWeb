export const API_UNAVAILABLE_EVENT = 'wetalk:api-unavailable'

export function notifyApiUnavailable() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(API_UNAVAILABLE_EVENT))
}
