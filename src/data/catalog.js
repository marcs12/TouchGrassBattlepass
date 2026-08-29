import { BONUS_HABITS, DAILY_HABITS } from './habits'
import { REWARDS } from './rewards'

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

// Both lists come from one merge, so an edit can move a habit between them.
const habitsFrom = (catalog) => merge([...DAILY_HABITS, ...BONUS_HABITS], catalog, 'habit')

export const dailyHabitsFrom = (catalog = []) =>
  habitsFrom(catalog).filter((h) => h.kind !== 'bonus')


export const bonusHabitsFrom = (catalog = []) =>
  habitsFrom(catalog).filter((h) => h.kind === 'bonus')

export const rewardsFrom = (catalog = []) => merge(REWARDS, catalog, 'reward')

/** Clearing every daily habit is what keeps a streak alive. */
export const dailyGoalFrom = (catalog = []) =>
  dailyHabitsFrom(catalog).reduce((sum, h) => sum + h.points, 0)
