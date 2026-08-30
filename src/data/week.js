import { shiftDay, today as todayKey } from '../lib/day'

// Week math for Sunday Night. Pure - it takes the same `history` array both
// backends already build, so nothing here talks to a backend and developer
// mode's time travel works for free through `today()`.
//
// A week runs Sunday to Saturday in the pair's own timezone, for the same
// reason a day rolls over at their midnight rather than UTC's. That is the
// calendar week people already read on a wall, so the streak strip and the
// week banner never disagree about which week you are in.
//
// The week therefore closes on Saturday midnight, and the recap lands the
// following evening: Sunday Night is the look back, not the deadline.

export const TARGET_WEEKS = 4 // how far back the median looks
export const MIN_TARGET_DAYS = 3 // a fresh pair reaches 100% in three full days
export const DEAD_HEAT = 0.05 // a margin under this is nobody's win
export const RECAP_HOUR = 20 // the evening after the week closes, local
export const REVEAL_AFTER_MS = 24 * 60 * 60 * 1000 // stake flips anyway after a day

/** The Sunday on or before `key`. */
export const weekStart = (key = todayKey()) => {
  const [y, m, d] = key.split('-').map(Number)
  // getDay() is already Sunday-first, so it is the offset back to Sunday.
  return shiftDay(key, -new Date(y, m - 1, d).getDay())
}

/** Saturday. */
export const weekEnd = (start) => shiftDay(start, 6)

/** The Sunday after the week closed - when its recap is due. */
export const recapDay = (start) => shiftDay(start, 7)
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => shiftDay(start, i))
export const prevWeek = (start) => shiftDay(start, -7)

/** ISO day keys sort as strings, so a range check needs no date parsing. */
const pointsBetween = (history, memberId, from, to) =>
  history.reduce(
    (sum, row) =>
      row.day >= from && row.day <= to ? sum + (row.totals?.[memberId] ?? 0) : sum,
    0
  )

/** Matches Postgres `percentile_cont(0.5)`: the mean of the middle pair. */
const median = (values) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length / 2
  return sorted.length % 2
    ? sorted[Math.floor(mid)]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export const minTargetFor = (dailyGoal) => Math.max(1, dailyGoal * MIN_TARGET_DAYS)

/**
 * What a normal week looks like for this player: the median of their own last
 * four. Scoring against yourself rather than against each other is the whole
 * point - raw points would just hand every week to whoever had the lighter
 * one at work.
 */
const targetFor = (history, memberId, start, minTarget) => {
  const prior = Array.from({ length: TARGET_WEEKS }, (_, i) => {
    const from = shiftDay(start, -7 * (i + 1))
    return pointsBetween(history, memberId, from, shiftDay(from, 6))
  })
  return Math.max(minTarget, Math.round(median(prior)))
}

/**
 * Live standing for a week. The same shape `settle_week` freezes into
 * `weeks.score`, so the banner and the recap read one thing.
 */
export function scoreWeek({ history = [], members = [], dailyGoal = 0, start, today = todayKey() }) {
  const from = start ?? weekStart(today)
  const to = weekEnd(from)
  const minTarget = minTargetFor(dailyGoal)

  const scored = {}
  for (const member of members) {
    const points = pointsBetween(history, member.id, from, to)
    const target = targetFor(history, member.id, from, minTarget)
    scored[member.id] = { points, target, score: points / target }
  }

  const [a, b] = members.map((m) => scored[m.id] ?? { points: 0, target: minTarget, score: 0 })
  const gap = (a?.score ?? 0) - (b?.score ?? 0)
  const winner =
    gap >= DEAD_HEAT ? members[0]?.id : -gap >= DEAD_HEAT ? members[1]?.id : null

  const teamPoints = (a?.points ?? 0) + (b?.points ?? 0)
  const teamTarget = (a?.target ?? 0) + (b?.target ?? 0)

  return {
    start: from,
    end: to,
    minTarget,
    // Inclusive: on Sunday there is still one day left to play.
    daysLeft: Math.max(0, Math.round((new Date(to) - new Date(today)) / 86400000) + 1),
    members: scored,
    team: { points: teamPoints, target: teamTarget, clear: teamPoints >= teamTarget },
    winner,
    tie: winner === null,
  }
}

/**
 * A finished week is ready on the Sunday evening after it closed, so the recap
 * lands as an event rather than at midnight on Saturday while you are asleep.
 *
 * The hour only matters on that Sunday itself; any later day is already past
 * it. Reading the day from `today` rather than the clock is what lets
 * developer mode's time travel reach a recap.
 */
export const recapReady = (start, today = todayKey(), now = new Date()) => {
  const due = recapDay(start)
  if (today > due) return true
  if (today < due) return false
  return now.getHours() >= RECAP_HOUR
}

/** Both players have seen it, or a day has passed and one of them is away. */
export const stakeRevealed = (week, memberCount = 2, now = Date.now()) => {
  if (!week || week.status !== 'settled') return false
  if ((week.opened_by?.length ?? 0) >= memberCount) return true
  return week.settled_at ? now - new Date(week.settled_at).getTime() > REVEAL_AFTER_MS : false
}

// Starting stakes, in the same shape as habits and rewards so the catalog
// override system can edit and extend them with no new machinery.
export const STAKES = [
  { id: 'breakfast', title: 'Breakfast in Bed', note: 'Made, carried up, no negotiating.', icon: 'coffee', hue: 28 },
  { id: 'pick-film', title: 'You Pick the Film', note: 'No vetoes for a whole evening.', icon: 'film', hue: 268 },
  { id: 'backrub', title: 'Twenty-Minute Back Rub', note: 'Timer on. No stopping early.', icon: 'spa', hue: 342 },
  { id: 'chore-pass', title: 'Chore Pass', note: 'One job of your choosing, done for you.', icon: 'broom', hue: 172 },
  { id: 'driver', title: 'Designated Driver', note: 'Every trip next week, you get chauffeured.', icon: 'car', hue: 198 },
  { id: 'takeaway', title: 'Their Treat', note: 'Dinner out or in, on them.', icon: 'sushi', hue: 8 },
]

// Awarded when the pair clears their combined target, whoever won.
export const TEAM_STAKE = {
  id: 'team-clear',
  title: 'Team Clear',
  note: 'You both hit your marks. Something you only do together.',
  icon: 'flag',
  hue: 138,
}
