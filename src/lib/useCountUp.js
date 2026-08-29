import { useEffect, useRef, useState } from 'react'

const prefersReduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Rolls a number toward its new value instead of snapping. Points landing in
 * the bank is the payoff moment of the whole app, so it gets to be felt.
 */
export function useCountUp(value, duration = 420) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return

    // A hidden tab pauses requestAnimationFrame, which would leave the number
    // mid-roll until it comes back. Snap instead - nobody is watching anyway.
    if (prefersReduced() || document.visibilityState === 'hidden') {
      fromRef.current = value
      setDisplay(value)
      return
    }

    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      // Land on the target so an interrupted roll never leaves a stale number.
      fromRef.current = value
      setDisplay(value)
    }
  }, [value, duration])

  return display
}
