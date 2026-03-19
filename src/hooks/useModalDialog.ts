import { type RefObject, useLayoutEffect } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap, Escape to dismiss, restore focus on unmount. Attach ref to the modal panel (not backdrop).
 */
export function useModalDialog(panelRef: RefObject<HTMLElement | null>, onDismiss: () => void): void {
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const previousActive = document.activeElement

    const focusFirst = () => {
      const list = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const target = list[0]
      requestAnimationFrame(() => target?.focus())
    }
    focusFirst()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }

      if (event.key !== 'Tab') return

      const list = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
        const style = window.getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') return false
        return !el.closest('[hidden]')
      })
      if (list.length === 0) return

      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (!event.shiftKey && active === last) {
        event.preventDefault()
        first?.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previousActive instanceof HTMLElement && document.contains(previousActive)) {
        previousActive.focus()
      }
    }
  }, [onDismiss, panelRef])
}
