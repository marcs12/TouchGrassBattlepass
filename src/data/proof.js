import { shiftDay } from '../lib/day'
import { weekStart } from './week'

// What happens to old photos.
//
// A proof photo is ~60KB after lib/photo downscales it, and two people
// checking things off will happily take one a day. Left alone that is a
// bucket that only ever grows, against weeks nobody is going to open again.
//
// So: recent weeks keep everything, and once a week is old enough it keeps a
// handful and lets the rest go. The check-off itself is untouched - the points
// stay, the log entry stays, only the picture goes.
//
// The cutoff is deliberately further back than the window of check rows the
// app reads (45 days), so thinning can never take a photo out from under a
// reel that is still on screen.
export const KEEP_WEEKS = 8
export const KEEP_PER_WEEK = 3

/** The Sunday KEEP_WEEKS weeks back. Everything from here on keeps its reel. */
export const thinBefore = (today) => shiftDay(weekStart(today), -7 * KEEP_WEEKS)

/** Newest first, so `slice` keeps the end of the week rather than the start. */
const newestFirst = (a, b) => {
  if (a.day !== b.day) return a.day < b.day ? 1 : -1
  return (b.at ?? 0) - (a.at ?? 0)
}

/**
 * Which photos an old week gives up: everything past the newest
 * KEEP_PER_WEEK of that week. Photos in the last KEEP_WEEKS weeks are never
 * returned.
 *
 * Pure, and takes the `{ day, at? }` shape both backends already hold, so the
 * device-only board and the synced one thin to exactly the same reel.
 */
export function thinnable(proofs, today) {
  const cutoff = thinBefore(today)

  const byWeek = new Map()
  for (const shot of proofs) {
    if (!shot?.day || shot.day >= cutoff) continue
    const week = weekStart(shot.day)
    byWeek.set(week, [...(byWeek.get(week) ?? []), shot])
  }

  const doomed = []
  for (const week of byWeek.values()) {
    doomed.push(...[...week].sort(newestFirst).slice(KEEP_PER_WEEK))
  }
  return doomed
}
