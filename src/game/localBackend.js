import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bonusHabitsFrom,
  dailyHabitsFrom,
  hueFor,
  rewardsFrom,
  slugify,
  stakesFrom,
  weeklyHabitsFrom,
} from '../data/catalog'
import { STREAK_MIN_CHECKS } from '../data/streak'
import { recentDays, shiftDay, today } from '../lib/day'
import { loadState, saveState } from '../lib/storage'
import { recapReady, scoreWeek, weekDays, weekStart } from '../data/week'
import { getProof, putProof, removeProof } from '../lib/proofStore'
import { prepare } from '../lib/photo'
import { thinnable } from '../data/proof'

// Device-only mode. Used when no Supabase credentials are configured, and as
// the shape both backends present to the UI.
//
// A season starts empty: every point in the bank was earned by someone.
const STARTING_BALANCE = 0
const LOG_LIMIT = 40
// Five weeks of days: the current one plus the four a target is the median of.
const HISTORY_DAYS = 45
const SETTLE_BACKLOG = 4

/**
 * Photos are keyed by the check's natural key here too, so the local and the
 * synced backend name the same picture the same way.
 */
const proofKey = (member, habitId, day) => `${member}_${habitId}_${day}`

// Object URLs would pile up if a scrolling list asked for the same photo over
// and over, so each key gets one for the life of the page.
const urls = new Map()

const freshState = () => ({
  members: null,
  activeId: null,
  balance: STARTING_BALANCE,
  earned: {},
  redeemed: [],
  // `done` is today's ticks; `weekDone` is the weekly list's, keyed by the day
  // each was actually made, because un-ticking one has to take back the points
  // from that day rather than from today.
  grind: { date: today(), done: {}, weekDone: {}, goalDates: {} },
  // The track resets with each season; the bank and the coupons don't.
  season: { n: 1, xp: 0, claimed: [] },
  pastSeasons: [],
  log: [],
  // Habits and rewards added in the app, plus hidden built-ins.
  catalog: [],
  // Points banked per member per day, keyed YYYY-MM-DD. The synced backend
  // derives this from its check rows; on-device there are no rows, so it is
  // accumulated as points move.
  history: {},
  // Sunday Night: the weekly stakes and results, the partner's stamps, and
  // what each photo is attached to. The photos themselves are blobs in
  // IndexedDB - on a device-only board they never go anywhere else.
  weeks: [],
  cosigns: [],
  proofs: {},
  // The reward you are both saving toward, by id. Null means nothing pinned.
  wish: null,
})

const normalize = (state) => {
  const base = freshState()
  return {
    ...base,
    ...state,
    earned: { ...base.earned, ...state.earned },
    log: state.log ?? base.log,
    catalog: state.catalog ?? [],
    history: state.history ?? {},
    weeks: state.weeks ?? [],
    cosigns: state.cosigns ?? [],
    proofs: state.proofs ?? {},
    pastSeasons: state.pastSeasons ?? [],
    grind: { ...base.grind, ...state.grind },
    season: { ...base.season, ...state.season },
  }
}

const addToHistory = (history, day, member, delta) => {
  const forDay = { ...(history[day] ?? {}) }
  forDay[member] = Math.max(0, (forDay[member] ?? 0) + delta)
  return { ...history, [day]: forDay }
}

/**
 * Scores a finished week into the state: freezes the result and mints the
 * prizes as zero-cost coupons, exactly as `settle_week` does on the server.
 * A week nobody played is left alone - there is no recap worth opening.
 */
const settleInto = (state, start) => {
  const members = state.members ?? []
  if (members.length < 2) return state
  if (state.weeks.some((w) => w.start_day === start && w.status === 'settled')) return state

  const history = recentDays(HISTORY_DAYS, state.grind.date).map((day) => ({
    day,
    totals: state.history[day] ?? {},
  }))
  const played = history.some(
    (row) =>
      row.day >= start &&
      row.day <= shiftDay(start, 6) &&
      Object.keys(row.totals).length > 0
  )
  if (!played) return state

  const dailyGoal = dailyHabitsFrom(state.catalog).reduce((sum, h) => sum + h.points, 0)
  const weeklyGoal = weeklyHabitsFrom(state.catalog).reduce((sum, h) => sum + h.points, 0)
  const result = scoreWeek({
    history,
    members,
    dailyGoal,
    weeklyGoal,
    start,
    today: state.grind.date,
  })

  const open = state.weeks.find((w) => w.start_day === start) ?? {}
  const row = {
    start_day: start,
    status: 'settled',
    stake_1: open.stake_1 ?? null,
    stake_2: open.stake_2 ?? null,
    stake_team: open.stake_team ?? null,
    winner_member_id: result.winner,
    score: { members: result.members, team: result.team, tie: result.tie },
    opened_by: open.opened_by ?? [],
    settled_at: new Date().toISOString(),
  }

  const prize = (suffix, title, icon, hue, by) => ({
    id: `week-${start}-${suffix}`,
    receiptId: `week-${start}-${suffix}`,
    title,
    description: `Week of ${start}`,
    cost: 0,
    icon,
    hue,
    tier: 'high',
    redeemedAt: Date.now(),
    usedAt: null,
    by,
  })

  const won = []
  if (result.winner) {
    // You win what the other one put up.
    const theirs = result.winner === members[0].id ? row.stake_2 : row.stake_1
    won.push(prize('win', theirs ?? 'Winner picks', 'trophy', 42, result.winner))
  }
  if (result.team.clear) {
    won.push(prize('team', row.stake_team ?? 'Team clear', 'flag', 138, null))
  }

  return {
    ...state,
    weeks: [row, ...state.weeks.filter((w) => w.start_day !== start)],
    redeemed: [...won, ...state.redeemed],
  }
}

const rollOver = (state, day = today()) => {
  if (state.grind.date === day) return state

  // Weekly ticks survive the night but not the week.
  const from = weekStart(day)
  const weekDone = Object.fromEntries(
    Object.entries(state.grind.weekDone ?? {}).map(([who, ticks]) => [
      who,
      Object.fromEntries(Object.entries(ticks).filter(([, when]) => when >= from)),
    ])
  )

  return { ...state, grind: { ...state.grind, date: day, done: {}, weekDone } }
}

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
      const roster = names.map((name, i) => ({
        id: `p${i + 1}`,
        name,
        slot: i + 1,
        handicap: 1,
      }))
      const first = roster[0].id
      return {
        ...prev,
        members: roster,
        activeId: first,
        earned: Object.fromEntries(roster.map((m) => [m.id, 0])),
        grind: {
          ...prev.grind,
          done: { [first]: prev.grind.done.legacy ?? [] },
          weekDone: {},
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
      const weekly = habit.kind === 'weekly'
      const done = new Set(prev.grind.done[who] ?? [])
      const ticks = { ...(prev.grind.weekDone?.[who] ?? {}) }

      // A weekly habit is ticked for the week, not the day, so what decides
      // whether this is an undo - and which day's points move - is the day it
      // was ticked on.
      const checkedDay = weekly
        ? (ticks[habit.id] ?? null)
        : done.has(habit.id)
          ? prev.grind.date
          : null
      const undoing = Boolean(checkedDay)

      if (undoing && prev.balance < habit.points) return prev

      if (undoing) {
        done.delete(habit.id)
        if (weekly) delete ticks[habit.id]
      } else {
        done.add(habit.id)
        // Only the weekly list keeps a tick past tonight; `done` is enough for
        // everything else, and a stale entry here would make a habit later
        // moved to the weekly list read as already done.
        if (weekly) ticks[habit.id] = prev.grind.date
      }

      // Today's standing only. Undoing a weekly ticked earlier in the week
      // takes its points off that day, but this device keeps no record of what
      // else was checked then, so that day's streak mark is left alone.
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      if (done.size >= STREAK_MIN_CHECKS) goalDates.add(prev.grind.date)
      else goalDates.delete(prev.grind.date)

      const day = undoing ? checkedDay : prev.grind.date
      const delta = undoing ? -habit.points : habit.points
      const entry = {
        id: `${habit.id}-${who}-${Date.now()}`,
        memberId: who,
        habitId: habit.id,
        day,
        label: undoing ? `${habit.title} (undone)` : habit.title,
        points: delta,
        at: Date.now(),
      }

      return {
        ...prev,
        history: addToHistory(prev.history, day, who, delta),
        log: [entry, ...prev.log].slice(0, LOG_LIMIT),
        balance: prev.balance + delta,
        earned: {
          ...prev.earned,
          [who]: Math.max(0, (prev.earned[who] ?? 0) + delta),
        },
        grind: {
          ...prev.grind,
          done: { ...prev.grind.done, [who]: [...done] },
          weekDone: { ...prev.grind.weekDone, [who]: ticks },
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

  const setCouponUsed = useCallback((receiptId, used) => {
    setState((prev) => ({
      ...prev,
      redeemed: prev.redeemed.map((r) =>
        r.receiptId === receiptId ? { ...r, usedAt: used ? Date.now() : null } : r
      ),
    }))
  }, [])

  const addCatalogItem = useCallback((kind, payload) => {
    setState((prev) => {
      const itemId = slugify(payload.title)
      return {
        ...prev,
        catalog: [
          ...prev.catalog,
          {
            row: itemId,
            kind,
            item_id: itemId,
            hidden: false,
            payload: { ...payload, hue: hueFor(itemId) },
          },
        ],
      }
    })
  }, [])

  // Editing a built-in stores an override row rather than changing code.
  const editCatalogItem = useCallback((kind, itemId, payload) => {
    setState((prev) => {
      const existing = prev.catalog.find(
        (c) => c.kind === kind && c.item_id === itemId
      )
      const next = existing
        ? prev.catalog.map((c) =>
            c.kind === kind && c.item_id === itemId
              ? { ...c, hidden: false, payload: { ...c.payload, ...payload } }
              : c
          )
        : [
            ...prev.catalog,
            { row: itemId, kind, item_id: itemId, hidden: false, payload },
          ]
      return { ...prev, catalog: next }
    })
  }, [])

  // Custom entries are dropped; built-ins are only switched off, since they
  // live in code and would come back on the next load anyway.
  const removeCatalogItem = useCallback((kind, itemId, isCustom) => {
    setState((prev) => ({
      ...prev,
      catalog: isCustom
        ? prev.catalog.filter((c) => !(c.kind === kind && c.item_id === itemId))
        : [
            ...prev.catalog.filter((c) => !(c.kind === kind && c.item_id === itemId)),
            { row: itemId, kind, item_id: itemId, hidden: true, payload: null },
          ],
    }))
  }, [])

  // ---- proof, stamps and the week ---------------------------------------

  const attachProof = useCallback(
    async (habit, file) => {
      const who = state.activeId
      // The day the check-off was made - see the synced backend. A weekly
      // habit ticked on Tuesday keeps its photo on Tuesday.
      const day = habit.day ?? state.grind.date
      if (!who) return

      const shot = await prepare(file)
      if (!shot) return

      const key = proofKey(who, habit.id, day)
      await putProof(key, shot.blob)
      urls.delete(key)

      setState((prev) => ({
        ...prev,
        proofs: {
          ...prev.proofs,
          [key]: {
            path: key,
            w: shot.width,
            h: shot.height,
            day,
            memberId: who,
            label: habit.title,
          },
        },
      }))
    },
    [state.activeId, state.grind.date]
  )

  const clearProof = useCallback((habit, path) => {
    if (!path) return
    removeProof(path)
    const url = urls.get(path)
    if (url) {
      URL.revokeObjectURL(url)
      urls.delete(path)
    }
    setState((prev) => {
      const next = { ...prev.proofs }
      delete next[path]
      return { ...prev, proofs: next }
    })
  }, [])

  const proofUrl = useCallback(async (path) => {
    if (!path) return null
    if (urls.has(path)) return urls.get(path)
    const blob = await getProof(path)
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urls.set(path, url)
    return url
  }, [])

  const cosign = useCallback((checkId, stamp = 'star') => {
    setState((prev) => ({
      ...prev,
      cosigns: [
        ...prev.cosigns.filter(
          (c) => !(c.check_id === checkId && c.member_id === prev.activeId)
        ),
        {
          check_id: checkId,
          member_id: prev.activeId,
          stamp,
          created_at: new Date().toISOString(),
        },
      ],
    }))
  }, [])

  const uncosign = useCallback((checkId) => {
    setState((prev) => ({
      ...prev,
      cosigns: prev.cosigns.filter(
        (c) => !(c.check_id === checkId && c.member_id === prev.activeId)
      ),
    }))
  }, [])

  // Slot 1 or 2 is that player's stake; slot 0 is the shared prize.
  const openWeek = useCallback((slot, stake) => {
    setState((prev) => {
      const start = weekStart(prev.grind.date)
      const existing = prev.weeks.find((w) => w.start_day === start)
      if (existing?.status === 'settled') return prev

      const field = slot === 0 ? 'stake_team' : slot === 1 ? 'stake_1' : 'stake_2'
      const row = {
        start_day: start,
        status: 'open',
        stake_1: null,
        stake_2: null,
        stake_team: null,
        winner_member_id: null,
        score: null,
        opened_by: [],
        settled_at: null,
        ...existing,
        [field]: stake,
      }
      return { ...prev, weeks: [row, ...prev.weeks.filter((w) => w.start_day !== start)] }
    })
  }, [])

  const markRecapOpened = useCallback((start) => {
    setState((prev) => ({
      ...prev,
      weeks: prev.weeks.map((w) =>
        w.start_day === start && !(w.opened_by ?? []).includes(prev.activeId)
          ? { ...w, opened_by: [...(w.opened_by ?? []), prev.activeId] }
          : w
      ),
    }))
  }, [])

  // The agreed multiplier for the week - see data/week.
  const setHandicap = useCallback((memberId, value) => {
    setState((prev) => ({
      ...prev,
      members: (prev.members ?? []).map((m) =>
        m.id === memberId ? { ...m, handicap: value } : m
      ),
    }))
  }, [])

  const setWish = useCallback((rewardId) => {
    setState((prev) => ({ ...prev, wish: rewardId || null }))
  }, [])

  /**
   * Everything a recap needs for one past week. The synced backend has to go
   * and fetch this; on a device-only board it is all already here, and this
   * exists so the recap can ask the same question of either one.
   */
  const loadWeek = useCallback(
    async (start) => {
      const days = weekDays(start)
      const end = days[days.length - 1]
      return {
        history: days.map((day) => ({ day, totals: state.history[day] ?? {} })),
        goalDates: state.grind.goalDates,
        proofs: Object.values(state.proofs)
          .filter((p) => p.day >= start && p.day <= end)
          .sort((a, b) => (a.day < b.day ? 1 : -1)),
        stamps: state.cosigns
          .map((c) => ({
            memberId: c.member_id,
            day: state.log.find((e) => e.id === c.check_id)?.day,
          }))
          .filter((c) => c.day),
      }
    },
    [state.history, state.proofs, state.cosigns, state.log, state.grind.goalDates]
  )

  /**
   * Closes the finished season and opens the next one. Mirrors `end_season` on
   * the server: the season's XP is frozen onto the shelf, the track resets, and
   * the bank, the coupons, the streaks and the photos all carry over.
   */
  // `season` is what the synced backend uses to spot a rollover the other
  // phone already did; on one device there is no race, so it only has to keep
  // the same shape.
  const endSeason = useCallback((required, season) => {
    setState((prev) => {
      if (season != null && season !== prev.season.n) return prev
      if (prev.season.xp < Math.max(1, required ?? 1)) return prev
      return {
        ...prev,
        pastSeasons: [
          { n: prev.season.n, xp: prev.season.xp, endedAt: new Date().toISOString() },
          ...prev.pastSeasons,
        ],
        season: { n: prev.season.n + 1, xp: 0, claimed: [] },
      }
    })
  }, [])

  /**
   * Lets old weeks give up most of their photos - see data/proof. On a
   * device-only board the blobs are all there is, and IndexedDB has a quota
   * like any bucket does.
   */
  const thinOldProofs = useCallback(async () => {
    const doomed = thinnable(Object.values(state.proofs), state.grind.date)
    if (doomed.length === 0) return { removed: 0 }

    const gone = new Set(doomed.map((shot) => shot.path))
    for (const path of gone) {
      removeProof(path)
      const url = urls.get(path)
      if (url) {
        URL.revokeObjectURL(url)
        urls.delete(path)
      }
    }

    setState((prev) => ({
      ...prev,
      proofs: Object.fromEntries(
        Object.entries(prev.proofs).filter(([key]) => !gone.has(key))
      ),
    }))
    return { removed: gone.size }
  }, [state.proofs, state.grind.date])

  // Once a session, the same as the synced backend.
  const thinnedThisSession = useRef(false)

  useEffect(() => {
    if (!state.members || thinnedThisSession.current) return
    thinnedThisSession.current = true
    thinOldProofs()
  }, [state.members, thinOldProofs])

  // Weeks settle on open, and catch up on any that were missed.
  useEffect(() => {
    setState((prev) => {
      if (!prev.members) return prev
      const current = weekStart(prev.grind.date)
      let next = prev
      for (let back = SETTLE_BACKLOG; back >= 1; back -= 1) {
        const start = shiftDay(current, -7 * back)
        if (recapReady(start, prev.grind.date)) next = settleInto(next, start)
      }
      return next
    })
  }, [state.grind.date])

  // ---- developer tools -------------------------------------------------
  // Same surface as the cloud backend so the panel doesn't care which is live.

  const devGrant = useCallback((requested) => {
    setState((prev) => {
      const who = prev.activeId
      // Taking points back can't overdraw the bank.
      const points = Math.max(requested, -prev.balance)
      if (points === 0) return prev
      return {
        ...prev,
        balance: prev.balance + points,
        earned: { ...prev.earned, [who]: Math.max(0, (prev.earned[who] ?? 0) + points) },
        history: addToHistory(prev.history, prev.grind.date, who, points),
        season: { ...prev.season, xp: Math.max(0, prev.season.xp + points) },
        log: [
          {
            id: `dev-${Date.now()}`,
            memberId: who,
            label: points < 0 ? 'Dev deduction' : 'Dev grant',
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
      const missing = dailyHabitsFrom(prev.catalog).filter((h) => !done.has(h.id))
      if (missing.length === 0) return prev

      const points = missing.reduce((sum, h) => sum + h.points, 0)
      missing.forEach((h) => done.add(h.id))
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      if (done.size >= STREAK_MIN_CHECKS) goalDates.add(prev.grind.date)

      return {
        ...prev,
        history: addToHistory(prev.history, prev.grind.date, who, points),
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
      const all = [
        ...dailyHabitsFrom(prev.catalog),
        ...weeklyHabitsFrom(prev.catalog),
        ...bonusHabitsFrom(prev.catalog),
      ]
      const points = done.reduce(
        (sum, id) => sum + (all.find((h) => h.id === id)?.points ?? 0),
        0
      )
      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      goalDates.delete(prev.grind.date)

      // Weekly ticks made today go with them; earlier ones in the same week
      // belong to a day this isn't clearing.
      const ticks = Object.fromEntries(
        Object.entries(prev.grind.weekDone?.[who] ?? {}).filter(
          ([, when]) => when !== prev.grind.date
        )
      )

      return {
        ...prev,
        history: addToHistory(prev.history, prev.grind.date, who, -points),
        balance: Math.max(0, prev.balance - points),
        earned: { ...prev.earned, [who]: Math.max(0, (prev.earned[who] ?? 0) - points) },
        season: { ...prev.season, xp: Math.max(0, prev.season.xp - points) },
        grind: {
          ...prev.grind,
          done: { ...prev.grind.done, [who]: [] },
          weekDone: { ...prev.grind.weekDone, [who]: ticks },
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
      grind: { ...prev.grind, done: {}, weekDone: {}, goalDates: {} },
      season: { n: 1, xp: 0, claimed: [] },
      pastSeasons: [],
      weeks: [],
      cosigns: [],
    }))
    return {
      cleared: ['points', 'receipts', 'tier claims', 'weeks', 'stamps', 'seasons'],
      kept: [],
    }
  }, [])

  const devSettleWeek = useCallback((start) => {
    setState((prev) => settleInto(prev, start))
  }, [])

  const devForget = useCallback(() => {
    try {
      localStorage.removeItem('tgbp.state')
    } catch {
      /* nothing to clear */
    }
    location.reload()
  }, [])

  const history = recentDays(HISTORY_DAYS, state.grind.date).map((day) => ({
    day,
    totals: state.history[day] ?? {},
  }))

  const dailyHabits = dailyHabitsFrom(state.catalog)
  const weeklyHabits = weeklyHabitsFrom(state.catalog)
  const bonusHabits = bonusHabitsFrom(state.catalog)
  const rewards = rewardsFrom(state.catalog)
  const dailyGoal = dailyHabits.reduce((sum, h) => sum + h.points, 0)
  const weeklyGoal = weeklyHabits.reduce((sum, h) => sum + h.points, 0)

  // The log carries its photo and its stamps, so one pass over it feeds both
  // the contribution list and the recap.
  const log = useMemo(() => {
    const stamps = new Map()
    for (const c of state.cosigns) {
      stamps.set(c.check_id, [
        ...(stamps.get(c.check_id) ?? []),
        { memberId: c.member_id, stamp: c.stamp },
      ])
    }
    return state.log.map((entry) => ({
      ...entry,
      // An undo keeps its place in the record but not the photo - a picture
      // hanging off "(undone)" reads as evidence for something that isn't.
      proof:
        entry.points > 0
          ? (state.proofs[proofKey(entry.memberId, entry.habitId, entry.day)] ?? null)
          : null,
      cosigns: stamps.get(entry.id) ?? [],
    }))
  }, [state.log, state.cosigns, state.proofs])

  const week = {
    ...scoreWeek({
      history,
      members: state.members ?? [],
      dailyGoal,
      weeklyGoal,
      start: weekStart(state.grind.date),
      today: state.grind.date,
    }),
    row: state.weeks.find((w) => w.start_day === weekStart(state.grind.date)) ?? null,
  }

  return {
    mode: 'local',
    ready: true,
    dailyHabits,
    weeklyHabits,
    bonusHabits,
    dailyGoal,
    weeklyGoal,
    rewards,
    stakes: stakesFrom(state.catalog),
    error: null,
    code: null,
    ...state,
    // Derived, and after the spread: state carries the raw versions of these
    // under the same names and would otherwise win.
    history,
    log,
    week,
    proofs: Object.values(state.proofs).sort((a, b) => (a.day < b.day ? 1 : -1)),
    // Flattened for the recap: who gave a stamp, and on which day.
    stamps: state.cosigns
      .map((c) => ({
        memberId: c.member_id,
        day: state.log.find((e) => e.id === c.check_id)?.day,
      }))
      .filter((c) => c.day),
    start,
    join: null,
    pickMember: null,
    switchMember,
    toggleHabit,
    redeem,
    claimTier,
    setCouponUsed,
    addCatalogItem,
    editCatalogItem,
    removeCatalogItem,
    attachProof,
    clearProof,
    proofUrl,
    cosign,
    uncosign,
    openWeek,
    markRecapOpened,
    endSeason,
    setHandicap,
    setWish,
    loadWeek,
    // Device-only mode has no partner to hear from and nothing to sync.
    status: 'local',
    notice: null,
    dismissNotice: () => {},
    dev: {
      grant: devGrant,
      completeDaily: devCompleteDaily,
      clearToday: devClearToday,
      clearPoints: devClearPoints,
      seedHistory: devSeedHistory,
      settleWeek: devSettleWeek,
      endSeason: () => endSeason(1, state.season.n),
      thinProofs: thinOldProofs,
      forget: devForget,
      refresh: null,
    },
  }
}
