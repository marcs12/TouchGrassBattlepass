import { useCallback, useEffect, useState } from 'react'
import { BONUS_HABITS, DAILY_HABITS } from '../data/habits'
import { shiftDay, today } from '../lib/day'
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
  grind: { date: today(), done: {}, goalDates: {} },
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

const rollOver = (state, day = today()) =>
  state.grind.date === day
    ? state
    : { ...state, grind: { ...state.grind, date: day, done: {} } }

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

  // ---- developer tools -------------------------------------------------
  // Same surface as the cloud backend so the panel doesn't care which is live.

  const devGrant = useCallback((points) => {
    setState((prev) => {
      const who = prev.activeId
      return {
        ...prev,
        balance: prev.balance + points,
        earned: { ...prev.earned, [who]: Math.max(0, (prev.earned[who] ?? 0) + points) },
        season: { ...prev.season, xp: Math.max(0, prev.season.xp + points) },
        log: [
          {
            id: `dev-${Date.now()}`,
            memberId: who,
            label: 'Dev grant',
            points,
            at: Date.now(),
          },
          ...prev.log,
        ].slice(0, LOG_LIMIT),
      }
    })
  }, [])

  const devCompleteDaily = useCallback(() => {
    setState((prev) => {
      const who = prev.activeId
      const done = new Set(prev.grind.done[who] ?? [])
      const missing = DAILY_HABITS.filter((h) => !done.has(h.id))
      if (missing.length === 0) return prev

      const points = missing.reduce((sum, h) => sum + h.points, 0)
      missing.forEach((h) => done.add(h.id))
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      goalDates.add(prev.grind.date)

      return {
        ...prev,
        balance: prev.balance + points,
        earned: { ...prev.earned, [who]: (prev.earned[who] ?? 0) + points },
        season: { ...prev.season, xp: prev.season.xp + points },
        grind: {
          ...prev.grind,
          done: { ...prev.grind.done, [who]: [...done] },
          goalDates: { ...prev.grind.goalDates, [who]: [...goalDates] },
        },
      }
    })
  }, [])

  const devClearToday = useCallback(() => {
    setState((prev) => {
      const who = prev.activeId
      const done = prev.grind.done[who] ?? []
      const all = [...DAILY_HABITS, ...BONUS_HABITS]
      const points = done.reduce(
        (sum, id) => sum + (all.find((h) => h.id === id)?.points ?? 0),
        0
      )
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      goalDates.delete(prev.grind.date)

      return {
        ...prev,
        balance: Math.max(0, prev.balance - points),
        earned: { ...prev.earned, [who]: Math.max(0, (prev.earned[who] ?? 0) - points) },
        season: { ...prev.season, xp: Math.max(0, prev.season.xp - points) },
        grind: {
          ...prev.grind,
          done: { ...prev.grind.done, [who]: [] },
          goalDates: { ...prev.grind.goalDates, [who]: [...goalDates] },
        },
      }
    })
  }, [])

  // Backfills cleared days so the streak strip has something to show.
  const devSeedHistory = useCallback((days) => {
    setState((prev) => {
      const who = prev.activeId
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      for (let i = 1; i <= days; i += 1) goalDates.add(shiftDay(prev.grind.date, -i))
      return {
        ...prev,
        grind: {
          ...prev.grind,
          goalDates: { ...prev.grind.goalDates, [who]: [...goalDates] },
        },
      }
    })
  }, [])

  // Wipes the economy back to a fresh board, keeping the players and theme.
  const devClearPoints = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      balance: STARTING_BALANCE,
      earned: Object.fromEntries(prev.members.map((m) => [m.id, 0])),
      redeemed: [],
      log: [],
      grind: { ...prev.grind, done: {}, goalDates: {} },
      season: { xp: 0, claimed: [] },
    }))
    return { cleared: ['points', 'receipts', 'tier claims'], kept: [] }
  }, [])

  const devForget = useCallback(() => {
    try {
      localStorage.removeItem('tgbp.state')
    } catch {
      /* nothing to clear */
    }
    location.reload()
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
    dev: {
      grant: devGrant,
      completeDaily: devCompleteDaily,
      clearToday: devClearToday,
      clearPoints: devClearPoints,
      seedHistory: devSeedHistory,
      forget: devForget,
      refresh: null,
    },
  }
}
