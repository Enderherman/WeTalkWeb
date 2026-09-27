import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
}

export function trapDialogTab(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) return
  const focusable = getFocusableElements(dialog)
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  const activeElement = document.activeElement
  if (event.shiftKey && (activeElement === first || activeElement === dialog || !dialog.contains(activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (activeElement === last || activeElement === dialog || !dialog.contains(activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

export function useDialogFocus(initialFocusSelector?: string) {
  const dialog = ref<HTMLElement | null>(null)
  const returnFocusTarget = typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement &&
    document.activeElement !== document.body
    ? document.activeElement
    : null

  onMounted(() => {
    void nextTick(() => {
      const root = dialog.value
      if (!root) return
      const preferred = initialFocusSelector
        ? root.querySelector<HTMLElement>(initialFocusSelector)
        : null
      ;(preferred || getFocusableElements(root)[0] || root).focus()
    })
  })

  onBeforeUnmount(() => {
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
  })

  function trapFocus(event: KeyboardEvent) {
    trapDialogTab(event, dialog.value)
  }

  return { dialog, trapFocus }
}
