import { useLayoutEffect, useState } from 'react'

const GUTTER = 10

/**
 * Anchors a popover under its trigger and keeps it on screen.
 *
 * CSS alone can't do this: the menus hang off triggers that sit near the left
 * edge on a phone, so a right-anchored panel ran off the side. This measures
 * the trigger and clamps the panel into the viewport instead.
 */
export function usePopover(triggerRef, panelRef, open) {
  const [style, setStyle] = useState({ visibility: 'hidden' })

  useLayoutEffect(() => {
    if (!open) return

    const place = () => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return

      const anchor = trigger.getBoundingClientRect()
      const width = Math.min(panel.offsetWidth, window.innerWidth - GUTTER * 2)
      const maxLeft = window.innerWidth - width - GUTTER

      setStyle({
        position: 'fixed',
        top: Math.round(anchor.bottom + 8),
        left: Math.round(Math.min(Math.max(GUTTER, anchor.right - width), maxLeft)),
        width,
        maxHeight: Math.round(window.innerHeight - anchor.bottom - 8 - GUTTER),
      })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, triggerRef, panelRef])

  return open ? style : { visibility: 'hidden' }
}
