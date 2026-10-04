// Browsers can report unloading XHRs as network errors rather than Axios
// cancellations. Only navigation lifecycle events suppress global navigation;
// hiding a living tab must retain normal API error handling.
let leavingPage = false
const markLeaving = () => { leavingPage = true }
const markActive = () => { leavingPage = false }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', markLeaving)
  window.addEventListener('pagehide', markLeaving)
  window.addEventListener('pageshow', markActive)
}

export function isPageLeaving(): boolean {
  return leavingPage
}

export async function navigateWhilePageActive<T>(navigate: () => Promise<T>): Promise<T | undefined> {
  if (leavingPage) return undefined
  try {
    return await navigate()
  } catch (error) {
    // A route import started while the page was active can be cancelled by a
    // subsequent refresh. Preserve all rejections while the document is active.
    if (leavingPage) return undefined
    throw error
  }
}
