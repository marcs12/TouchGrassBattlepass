import { useCallback, useEffect, useRef, useState } from 'react'

// Hidden until asked for, then sticky. Three ways in:
//   phone   - seven taps on the brand logo within three seconds
//   laptop  - type "dev", or press ctrl/cmd + shift + D
//   either  - load the app with #dev in the URL
const KEY = 'tgbp.dev.on'
const TAPS_NEEDED = 7
const TAP_WINDOW = 3000
const SEQUENCE = 'dev'

const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function useDevMode() {
  const [on, setOn] = useState(
    () => read() || (typeof location !== 'undefined' && location.hash === '#dev')
  )
  const taps = useRef([])
  const typed = useRef('')

  const set = useCallback((value) => {
    setOn(value)
    try {
      if (value) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      /* private mode - dev mode lasts for this page only */
    }
  }, [])

  // Laptop: a typed word, or the shortcut. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        set(!read())
        return
      }

      if (e.key.length !== 1) return
      typed.current = (typed.current + e.key.toLowerCase()).slice(-SEQUENCE.length)
      if (typed.current === SEQUENCE) {
        typed.current = ''
        set(true)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set])

  // Phone: tap the logo repeatedly, Android build-number style.
  const registerTap = useCallback(() => {
    const now = Date.now()
    taps.current = [...taps.current, now].filter((t) => now - t < TAP_WINDOW)
    if (taps.current.length >= TAPS_NEEDED) {
      taps.current = []
      set(true)
    }
    return TAPS_NEEDED - taps.current.length
  }, [set])

  return { on, enable: () => set(true), disable: () => set(false), registerTap }
}
