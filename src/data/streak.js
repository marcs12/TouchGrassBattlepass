import { shiftDay } from '../lib/day'

// What keeps a streak alive.
//
// Two rules, both here so they can be argued with in one place:
//
//   STREAK_MIN_CHECKS      how many check-offs make a day count
//   STREAK_SKIPS_PER_MONTH how many missed days a streak survives in a month
//
// The first used to be the whole daily list, which made the streak a record of
// perfect days and therefore mostly a record of broken ones. The second exists
// because a streak that dies to one flight, one illness or one bad Tuesday
// stops being something you protect and starts being something you resent.
export const STREAK_MIN_CHECKS = 3
export const STREAK_SKIPS_PER_MONTH = 2

// A streak is walked backwards day by day; this stops a corrupt save walking
// off the end of the calendar.
const WALK_LIMIT = 800

const monthOf = (day) => day.slice(0, 7)

/**
 * Walks back from today over the days that counted.
 *
 * A missed day spends a skip from that day's own month. Run out of skips in a
 * month and the streak ends there. Today is never a miss - it isn't over yet.
 *
 * Returns the length, the first day the streak covers (so the strip can show
 * which misses were forgiven), and the skips spent per month.
 */
export function streakInfo(
  goalDates = [],
  today,
  skipsPerMonth = STREAK_SKIPS_PER_MONTH
) {
  const hit = new Set(goalDates)
  let cursor = hit.has(today) ? today : shiftDay(today, -1)
  let length = 0
  let from = null
  const used = {}

  for (let step = 0; step < WALK_LIMIT; step += 1) {
    if (hit.has(cursor)) {
      length += 1
      from = cursor
    } else {
      const month = monthOf(cursor)
      used[month] = (used[month] ?? 0) + 1
      if (used[month] > skipsPerMonth) break
    }
    cursor = shiftDay(cursor, -1)
  }

  // A streak of nothing has forgiven nothing, whatever the walk spent finding
  // that out.
  const spent = length === 0 ? 0 : (used[monthOf(today)] ?? 0)

  return {
    length,
    from,
    skipsUsed: spent,
    skipsLeft: Math.max(0, skipsPerMonth - spent),
    skipsPerMonth,
  }
}

/**
 * Consecutive counted days ending today (or yesterday, if today is still
 * open). Derived from the stored dates rather than a running counter, so
 * unchecking a habit correctly walks the streak back.
 */
export const streakFrom = (goalDates, today) => streakInfo(goalDates, today).length

/** Days inside the streak that were missed and forgiven. */
export const skippedDays = (goalDates = [], today, from) => {
  if (!from) return new Set()
  const hit = new Set(goalDates)
  const out = new Set()
  for (let day = from; day <= today; day = shiftDay(day, 1)) {
    if (!hit.has(day) && day !== today) out.add(day)
  }
  return out
}
