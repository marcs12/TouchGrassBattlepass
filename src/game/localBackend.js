import { useCallback, useEffect, useState } from 'react'
import { DAILY_HABITS } from '../data/habits'
import { dayKey } from '../lib/day'
import { loadState, saveState } from '../lib/storage'

// Device-only mode. Used when no Supabase credentials are configured, and as
// the shape both backends present to the UI.
const STARTING_BALANCE = 2750
const LOG_LIMIT = 40

const freshState = () => ({
  members: null,
  activeId: null,
  balance: STARTING_BALANCE,
  earned: {},
  redeemed: [],
  grind: { date: dayKey(), done: {}, goalDates: {} },
  season: { xp: 0, claimed: [] },
  log: [],
})

const normalize = (state) => {
  const base = freshState()
  return {
    ...base,
    ...state,
    earned: { ...base.earned, ...state.earned },
    log: state.log ?? base.log,
    grind: { ...base.grind, ...state.grind },
    season: { ...base.season, ...state.season },
  }
}

const rollOver = (state, today = dayKey()) =>
  state.grind.date === today
    ? state
    : { ...state, grind: { ...state.grind, date: today, done: {} } }

export function useLocalGame() {
  const [state, setState] = useState(() =>
    rollOver(normalize(loadState() ?? freshState()))
  )

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const check = () => setState((prev) => rollOver(prev))
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const start = useCallback((names) => {
    setState((prev) => {
      const roster = names.map((name, i) => ({ id: `p${i + 1}`, name, slot: i + 1 }))
      const first = roster[0].id
      return {
        ...prev,
        members: roster,
        activeId: first,
        earned: Object.fromEntries(roster.map((m) => [m.id, 0])),
        grind: {
          ...prev.grind,
          done: { [first]: prev.grind.done.legacy ?? [] },
          goalDates: { [first]: prev.grind.goalDates.legacy ?? [] },
        },
      }
    })
  }, [])

  const switchMember = useCallback((id) => {
    setState((prev) => ({ ...prev, activeId: id }))
  }, [])

  const redeem = useCallback((reward) => {
    setState((prev) => {
      if (prev.balance < reward.cost) return prev
      return {
        ...prev,
        balance: prev.balance - reward.cost,
        redeemed: [
          {
            ...reward,
            receiptId: `${reward.id}-${Date.now()}`,
            redeemedAt: Date.now(),
            by: prev.activeId,
          },
          ...prev.redeemed,
        ],
      }
    })
  }, [])

  const toggleHabit = useCallback((habit) => {
    setState((prev) => {
      const who = prev.activeId
      const done = new Set(prev.grind.done[who] ?? [])
      const undoing = done.has(habit.id)

      if (undoing && prev.balance < habit.points) return prev

      if (undoing) done.delete(habit.id)
      else done.add(habit.id)

      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      if (DAILY_HABITS.every((h) => done.has(h.id))) goalDates.add(prev.grind.date)
      else goalDates.delete(prev.grind.date)

      const delta = undoing ? -habit.points : habit.points
      const entry = {
        id: `${habit.id}-${who}-${Date.now()}`,
        memberId: who,
        label: undoing ? `${habit.title} (undone)` : habit.title,
        points: delta,
        at: Date.now(),
      }

      return {
        ...prev,
        log: [entry, ...prev.log].slice(0, LOG_LIMIT),
        balance: prev.balance + delta,
        earned: {
          ...prev.earned,
          [who]: Math.max(0, (prev.earned[who] ?? 0) + delta),
        },
        grind: {
          ...prev.grind,
          done: { ...prev.grind.done, [who]: [...done] },
          goalDates: { ...prev.grind.goalDates, [who]: [...goalDates] },
        },
        season: { ...prev.season, xp: Math.max(0, prev.season.xp + delta) },
      }
    })
  }, [])

  const claimTier = useCallback((tier) => {
    setState((prev) => {
      if (prev.season.xp < tier.xp) return prev
      if (prev.season.claimed.includes(tier.n)) return prev
      return {
        ...prev,
        balance: tier.type === 'bonus' ? prev.balance + tier.value : prev.balance,
        season: { ...prev.season, claimed: [...prev.season.claimed, tier.n] },
      }
    })
  }, [])

  return {
    mode: 'local',
    ready: true,
    error: null,
    code: null,
    ...state,
    start,
    join: null,
    pickMember: null,
    switchMember,
    toggleHabit,
    redeem,
    claimTier,
  }
}
