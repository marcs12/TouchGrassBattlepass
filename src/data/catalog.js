import { BONUS_HABITS, DAILY_HABITS, WEEKLY_HABITS } from './habits'
import { REWARDS } from './rewards'
import { STAKES } from './week'

// The catalogs that ship in code are defaults, not the whole story: a
// household can add its own entries and switch off the ones it doesn't want.
// Everything downstream reads the merged lists from here.

const HUES = [8, 34, 96, 138, 176, 200, 248, 286, 320, 342]

/** Stable-ish hue from an id, so custom items get art without asking for one. */
export const hueFor = (seed) => {
  let total = 0
  for (const char of seed) total += char.charCodeAt(0)
  return HUES[total % HUES.length]
}

export const slugify = (title) =>
  `custom-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)}-${Math.random().toString(36).slice(2, 6)}`

/**
 * A catalog row does one of three jobs, decided by whether its id matches a
 * built-in and whether it carries a payload:
 *   hidden        - switch a built-in off
 *   override      - edit a built-in's fields in place
 *   custom entry  - something the household added
 */
const merge = (builtIns, catalog, kind) => {
  const rows = catalog.filter((c) => c.kind === kind)
  const builtInIds = new Set(builtIns.map((item) => item.id))
  const hidden = new Set(rows.filter((c) => c.hidden).map((c) => c.item_id))
  const overrides = new Map(
    rows
      .filter((c) => !c.hidden && c.payload && builtInIds.has(c.item_id))
      .map((c) => [c.item_id, c.payload])
  )

  const kept = builtIns
    .filter((item) => !hidden.has(item.id))
    .map((item) =>
      overrides.has(item.id)
        ? { ...item, ...overrides.get(item.id), id: item.id, edited: true }
        : item
    )

  const custom = rows
    .filter((c) => !c.hidden && c.payload && !builtInIds.has(c.item_id))
    .map((c) => ({ ...c.payload, id: c.item_id, custom: true }))

  return [...kept, ...custom]
}

// All three lists come from one merge, so an edit can move a habit between
// them - daily to weekly is a change of pace, not a different habit.
const habitsFrom = (catalog) =>
  merge([...DAILY_HABITS, ...WEEKLY_HABITS, ...BONUS_HABITS], catalog, 'habit')

// Daily is the default: an entry with no `kind` at all is one, which is what
// keeps saves written before weekly existed reading the same way.
export const dailyHabitsFrom = (catalog = []) =>
  habitsFrom(catalog).filter((h) => h.kind !== 'bonus' && h.kind !== 'weekly')

export const weeklyHabitsFrom = (catalog = []) =>
  habitsFrom(catalog).filter((h) => h.kind === 'weekly')

export const bonusHabitsFrom = (catalog = []) =>
  habitsFrom(catalog).filter((h) => h.kind === 'bonus')

export const rewardsFrom = (catalog = []) => merge(REWARDS, catalog, 'reward')

/** What either of you can put up for the week. Same three jobs as the rest. */
export const stakesFrom = (catalog = []) => merge(STAKES, catalog, 'stake')

/** What a full daily list pays - the pace a week's target is built from. */
export const dailyGoalFrom = (catalog = []) =>
  dailyHabitsFrom(catalog).reduce((sum, h) => sum + h.points, 0)

/** What a full weekly list pays. */
export const weeklyGoalFrom = (catalog = []) =>
  weeklyHabitsFrom(catalog).reduce((sum, h) => sum + h.points, 0)
