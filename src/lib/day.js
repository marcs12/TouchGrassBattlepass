// Local-date helpers. Everything keys off "YYYY-MM-DD" in the user's own
// timezone - a day rolls over at their midnight, not UTC's.
//
// Developer mode can shift what the app considers "today" so daily resets and
// streaks are testable without waiting a day. Only `today()` honours the
// offset; `dayKey`/`shiftDay` stay pure so shifting never compounds.
const OFFSET_KEY = 'tgbp.dev.offset'

export const getDayOffset = () => {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0
  } catch {
    return 0
  }
}

export const setDayOffset = (days) => {
  try {
    if (days) localStorage.setItem(OFFSET_KEY, String(days))
    else localStorage.removeItem(OFFSET_KEY)
  } catch {
    /* private mode - time travel just won't stick */
  }
}
export const dayKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** What the app treats as today, developer offset included. */
export const today = () => shiftDay(dayKey(), getDayOffset())

export const shiftDay = (key, days) => {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  return dayKey(date)
}

/**
 * Consecutive goal-hit days ending today (or yesterday, if today is still
 * open). Derived from the stored dates rather than a running counter, so
 * unchecking a habit correctly walks the streak back.
 */
export const streakFrom = (goalDates, today = dayKey()) => {
  const hit = new Set(goalDates)
  let cursor = hit.has(today) ? today : shiftDay(today, -1)
  let streak = 0

  while (hit.has(cursor)) {
    streak += 1
    cursor = shiftDay(cursor, -1)
  }

  return streak
}

/** The last `count` days, oldest first - for the streak strip and charts. */
export const recentDays = (count, today = dayKey()) =>
  Array.from({ length: count }, (_, i) => shiftDay(today, i - (count - 1)))
