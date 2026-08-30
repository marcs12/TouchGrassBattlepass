import { shiftDay, today as todayKey } from '../lib/day'

// Week math for Sunday Night. Pure - it takes the same `history` array both
// backends already build, so nothing here talks to a backend and developer
// mode's time travel works for free through `today()`.
//
// The week is a straight race: whoever banks more points over the seven days
// takes it. Missing a habit costs you those points and nothing else - there is
// no perfect-week requirement, because there is no such week.
//
// A week runs Sunday to Saturday in the pair's own timezone, for the same
// reason a day rolls over at their midnight rather than UTC's. That is the
// calendar week people already read on a wall, so the streak strip and the
// week banner never disagree about which week you are in.
//
// The week therefore closes on Saturday midnight, and the recap lands the
// following evening: Sunday Night is the look back, not the deadline.

export const WEEK_TARGET_DAYS = 5 // a good week, not a perfect one
export const DEAD_HEAT = 0.05 // a lead under this share of the leader is nobody's win
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

/**
 * A player's agreed multiplier, defaulting to level.
 *
 * Points-only quietly favours whoever has the lighter week at work, and the
 * two of you already know which of you that is. Rather than have the database
 * guess at it - which is what the old median target was doing - this is a
 * number you both agree on out loud and can change whenever it stops being
 * true.
 */
export const HANDICAP_MIN = 0.5
export const HANDICAP_MAX = 2
export const HANDICAP_STEP = 0.05

export const handicapOf = (member) => {
  const raw = Number(member?.handicap)
  if (!Number.isFinite(raw) || raw <= 0) return 1
  return Math.min(HANDICAP_MAX, Math.max(HANDICAP_MIN, raw))
}

/**
 * What a good week is worth: five full daily lists plus the weekly list.
 *
 * Five rather than seven on purpose - a target you only reach by never missing
 * a day is a target that is missed, and the point of the week is the race, not
 * a perfect record. The weekly habits count once because that is how often
 * they come round.
 *
 * It is the same number for both players, which is what makes the week a
 * straight race: whoever banks more points wins it.
 */
export const weekTargetFor = (dailyGoal = 0, weeklyGoal = 0) =>
  Math.max(1, dailyGoal * WEEK_TARGET_DAYS + weeklyGoal)

/**
 * Live standing for a week. The same shape `settle_week` freezes into
 * `weeks.score`, so the banner and the recap read one thing.
 *
 * The week is won on points banked, full stop. `target` is there for the
 * progress bars - how the week is going - and never decides the winner.
 */
export function scoreWeek({
  history = [],
  members = [],
  dailyGoal = 0,
  weeklyGoal = 0,
  start,
  today = todayKey(),
}) {
  const from = start ?? weekStart(today)
  const to = weekEnd(from)
  const target = weekTargetFor(dailyGoal, weeklyGoal)

  const scored = {}
  for (const member of members) {
    const points = pointsBetween(history, member.id, from, to)
    const weight = handicapOf(member)
    scored[member.id] = {
      points,
      weight,
      // What the race actually compares. With no handicap set it is the same
      // number as `points`, which is the case this is tuned for.
      adjusted: Math.round(points * weight),
      target,
      score: Math.round(points * weight) / target,
    }
  }

  const [a, b] = members.map(
    (m) => scored[m.id] ?? { points: 0, weight: 1, adjusted: 0, target, score: 0 }
  )
  const aPoints = a?.adjusted ?? 0
  const bPoints = b?.adjusted ?? 0
  const lead = Math.abs(aPoints - bPoints)
  const front = Math.max(aPoints, bPoints)

  // A lead under 5% of the leader's own total is a dead heat: nobody takes a
  // week off the other one over a single check-off's worth of points. A week
  // where neither of you banked anything is a dead heat too.
  const decided = front > 0 && lead >= front * DEAD_HEAT
  const winner = !decided ? null : aPoints > bPoints ? members[0]?.id : members[1]?.id

  // Adjusted on both sides, so a handicap moves the shared prize the same way
  // it moves the race.
  const teamPoints = aPoints + bPoints
  const teamTarget = target * Math.max(1, members.length)

  return {
    start: from,
    end: to,
    target,
    lead,
    handicapped: members.some((m) => handicapOf(m) !== 1),
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
