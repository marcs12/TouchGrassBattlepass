// Local-date helpers. Everything keys off "YYYY-MM-DD" in the user's own
// timezone - a day rolls over at their midnight, not UTC's.
export const dayKey = (date = new Date()) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

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

/** The last `count` days, oldest first - for the streak strip. */
export const recentDays = (count, today = dayKey()) =>
  Array.from({ length: count }, (_, i) => shiftDay(today, i - (count - 1)))
