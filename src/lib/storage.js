// Local persistence for the whole game state. Stands in for the shared
// backend: without it a day's checklist would vanish on reload, which makes
// daily resets and streaks meaningless.
const KEY = 'tgbp.state'
const VERSION = 1

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.v === VERSION ? parsed : null
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
