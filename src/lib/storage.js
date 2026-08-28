// Local persistence for the whole game state. Stands in for the shared
// backend: without it a day's checklist would vanish on reload, which makes
// daily resets and streaks meaningless.
const KEY = 'tgbp.state'
const VERSION = 2

// v1 was single-player: one flat `done` list and no members. Fold that day's
// progress into the first player rather than throwing the save away.
const migrateV1 = (old) => ({
  ...old,
  members: null,
  activeId: null,
  earned: {},
  grind: {
    date: old.grind?.date,
    done: { legacy: old.grind?.done ?? [] },
    goalDates: { legacy: old.grind?.goalDates ?? [] },
  },
})

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v === VERSION) return parsed
    if (parsed?.v === 1) return migrateV1(parsed)
    return null
  } catch {
    return null
  }
}

export const saveState = (state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, v: VERSION }))
  } catch {
    /* private mode - state just won't persist */
  }
}
