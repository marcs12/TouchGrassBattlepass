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

const merge = (builtIns, catalog, kind) => {
  const hidden = new Set(
    catalog.filter((c) => c.kind === kind && c.hidden).map((c) => c.item_id)
  )
  const custom = catalog
    .filter((c) => c.kind === kind && !c.hidden && c.payload)
    .map((c) => ({ ...c.payload, id: c.item_id, custom: true }))

  return [...builtIns.filter((item) => !hidden.has(item.id)), ...custom]
}

export const dailyHabitsFrom = (catalog = []) =>
  merge(DAILY_HABITS, catalog, 'habit').filter((h) => h.kind !== 'bonus')

export const bonusHabitsFrom = (catalog = []) =>
  [
    ...BONUS_HABITS.filter(
      (h) => !catalog.some((c) => c.kind === 'habit' && c.hidden && c.item_id === h.id)
    ),
    ...catalog
      .filter((c) => c.kind === 'habit' && !c.hidden && c.payload?.kind === 'bonus')
      .map((c) => ({ ...c.payload, id: c.item_id, custom: true })),
  ]

export const rewardsFrom = (catalog = []) => merge(REWARDS, catalog, 'reward')

/** Clearing every daily habit is what keeps a streak alive. */
export const dailyGoalFrom = (catalog = []) =>
  dailyHabitsFrom(catalog).reduce((sum, h) => sum + h.points, 0)
