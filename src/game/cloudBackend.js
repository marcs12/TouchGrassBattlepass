import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
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
import { recentDays, shiftDay, today as todayKey } from '../lib/day'
import { recapReady, scoreWeek, weekDays, weekStart, weekTargetFor } from '../data/week'
import {
  applyPending,
  cacheRows,
  cachedRows,
  isOffline,
  loadQueue,
  saveQueue,
} from '../lib/queue'
import { getProof, putProof, removeProof } from '../lib/proofStore'
import { prepare } from '../lib/photo'
import { orphansIn, thinBefore, thinnable } from '../data/proof'

// Supabase-backed mode: two devices, one board.
//
// Nothing stores a balance. Points are derived from the rows every time, so
// two phones checking things off at the same moment can't clobber each other.

const HOUSEHOLD_KEY = 'tgbp.household'
const HISTORY_DAYS = 45
const LOG_LIMIT = 40
const PROOF_BUCKET = 'proof'
// Weeks are settled on open rather than by a cron, so a pair who didn't
// launch the app for a fortnight still gets every recap they missed.
const SETTLE_BACKLOG = 4
// How many old photos one pass lets go at a time.
const THIN_BATCH = 100

/**
 * Whether a failed write is worth trying again.
 *
 * Postgres says so in the SQLSTATE. A policy refusing the row, a constraint
 * rejecting it, a column that does not exist: those fail identically forever,
 * and one of them sitting at the head of the queue stops every write behind it
 * - the board goes quiet and the dot says "1 waiting" until the end of time.
 *
 * Connections (08), transaction rollbacks and deadlocks (40), exhausted
 * resources (53) and cancelled statements (57) are worth another go. So is any
 * failure with no code at all, which is what a dead network looks like.
 */
const RETRYABLE_SQLSTATE = /^(08|40|53|57)/

const worthRetrying = (error) =>
  !error?.code || RETRYABLE_SQLSTATE.test(String(error.code))

// What to say when one is dropped. Naming the thing that was lost beats a
// SQLSTATE, and beats saying nothing at all - which is what happens if this
// goes in the error banner, since the refetch straight afterwards clears it.
const DROPPED = {
  'cosign.add': 'Your stamp did not save.',
  'cosign.remove': 'Taking that stamp back did not save.',
  'check.add': 'That check-off did not save. Tick it again?',
  'check.remove': 'Un-ticking that did not save.',
  'coupon.set': 'That coupon did not save.',
  'catalog.upsert': 'That edit did not save.',
  'catalog.remove': 'Removing that did not save.',
  'proof.remove': 'Removing that photo did not save.',
}
// How many objects the sweep lists per request.
const SWEEP_PAGE = 100

// Signing a URL is a round trip, and a recap reel asks for the same handful
// over and over. Cache under the expiry so a scroll doesn't re-sign anything.
const SIGN_FOR = 60 * 60
const SIGN_TTL = 55 * 60 * 1000
const signed = new Map()

async function signProof(path) {
  if (!path) return null
  const hit = signed.get(path)
  if (hit && Date.now() - hit.at < SIGN_TTL) return hit.url

  const { data } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, SIGN_FOR)
  if (!data?.signedUrl) return null
  signed.set(path, { url: data.signedUrl, at: Date.now() })
  return data.signedUrl
}

/**
 * Where a photo lives. Keyed by the check's natural key, not its id: a
 * check-off made offline has no id until it reaches the server, and the photo
 * has to be addressable before then.
 */
export const proofPathFor = (household, member, habitId, day, ext = 'webp') =>
  `${household}/${member}_${habitId}_${day}.${ext}`

const rememberHousehold = (id) => {
  try {
    if (id) localStorage.setItem(HOUSEHOLD_KEY, id)
    else localStorage.removeItem(HOUSEHOLD_KEY)
  } catch {
    /* private mode - we re-discover the household from the server anyway */
  }
}

const readHousehold = () => {
  try {
    return localStorage.getItem(HOUSEHOLD_KEY)
  } catch {
    return null
  }
}

/** Rows in, the exact view model the components already consume out. */
function project(rows, today) {
  const { household, members, checks, redemptions, claims } = rows
  const catalog = rows.catalog ?? []
  const weeks = rows.weeks ?? []
  const seasons = rows.seasons ?? []
  const dailyHabits = dailyHabitsFrom(catalog)

  // Stamps, hung off the check they belong to.
  const byCheck = new Map()
  const stamps = new Map()
  for (const check of checks) byCheck.set(check.id, check.day)
  for (const stamp of rows.cosigns ?? []) {
    stamps.set(stamp.check_id, [
      ...(stamps.get(stamp.check_id) ?? []),
      { memberId: stamp.member_id, stamp: stamp.stamp },
    ])
  }

  const roster = [...members]
    .sort((a, b) => a.slot - b.slot)
    .map((m) => ({ id: m.id, name: m.name, slot: m.slot, handicap: m.handicap ?? 1 }))

  const earned = Object.fromEntries(roster.map((m) => [m.id, 0]))
  const done = {}
  const byMemberDay = new Map()

  for (const check of checks) {
    earned[check.member_id] = (earned[check.member_id] ?? 0) + check.points
    if (check.day === today) {
      done[check.member_id] = [...(done[check.member_id] ?? []), check.habit_id]
    }
    const key = `${check.member_id}|${check.day}`
    byMemberDay.set(key, [...(byMemberDay.get(key) ?? []), check.habit_id])
  }

  // A day counts toward the streak once that member has checked off
  // STREAK_MIN_CHECKS of anything - see data/habits for why it is not the whole
  // daily list any more.
  const goalDates = {}
  for (const [key, habitIds] of byMemberDay) {
    const [memberId, day] = key.split('|')
    if (new Set(habitIds).size >= STREAK_MIN_CHECKS) {
      goalDates[memberId] = [...(goalDates[memberId] ?? []), day]
    }
  }

  // Every check-off made this week, and the day it was made on. The weekly
  // list reads its done-state from here rather than from `done`, because a
  // weekly habit is ticked once for the week on whichever day you got round to
  // it, and un-ticking has to delete the row on that day.
  //
  // It holds every kind, not only the weekly ones: a habit moved from the
  // daily list to the weekly one mid-week is then already ticked, rather than
  // paying out a second time for a day it was checked on.
  const from = weekStart(today)
  const weekDone = {}
  for (const check of checks) {
    if (check.day < from) continue
    weekDone[check.member_id] = { ...(weekDone[check.member_id] ?? {}), [check.habit_id]: check.day }
  }

  // Points per member per day, for the progress chart. Derived from the same
  // checks the balance comes from, so the two can never disagree.
  const byDay = new Map()
  for (const check of checks) {
    const day = byDay.get(check.day) ?? {}
    day[check.member_id] = (day[check.member_id] ?? 0) + check.points
    byDay.set(check.day, day)
  }
  const history = recentDays(HISTORY_DAYS, today).map((day) => ({
    day,
    totals: byDay.get(day) ?? {},
  }))

  const weeklyHabits = weeklyHabitsFrom(catalog)
  const dailyGoal = dailyHabits.reduce((sum, h) => sum + h.points, 0)
  const weeklyGoal = weeklyHabits.reduce((sum, h) => sum + h.points, 0)
  const spent = redemptions.reduce((sum, r) => sum + r.cost, 0)
  const bonuses = claims.reduce((sum, c) => sum + (c.bonus ?? 0), 0)

  // Only the last few weeks of check rows are read, so the points banked
  // before that window come back as one number from the server. Without it the
  // bank would quietly shed every point older than the window while the
  // server - which is what actually authorises spending - kept them.
  const lifetime = (rows.before ?? 0) + checks.reduce((sum, c) => sum + c.points, 0)

  // The season being played, and the lifetime total it started from. A board
  // on the pre-seasons schema has no rows here and reads as season 1 from zero,
  // which is exactly what it was.
  const season =
    [...seasons].filter((s) => !s.ended_at).sort((a, b) => b.n - a.n)[0] ?? null
  const seasonNo = season?.n ?? 1
  const seasonXp = Math.max(0, lifetime - (season?.xp_base ?? 0))

  return {
    code: household?.code ?? null,
    members: roster,
    // The reward you are both saving toward, if it still exists.
    wish: household?.wish_reward_id ?? null,
    history,
    dailyHabits,
    weeklyHabits,
    bonusHabits: bonusHabitsFrom(catalog),
    dailyGoal,
    weeklyGoal,
    rewards: rewardsFrom(catalog),
    balance: (household?.seed_balance ?? 0) + lifetime + bonuses - spent,
    earned,
    grind: { date: today, done, weekDone, goalDates },
    // Tiers are claimable once per season, so the track only knows about this
    // one. Their bonuses stay in the bank forever, which is why `bonuses`
    // above counts every season's.
    season: {
      n: seasonNo,
      xp: seasonXp,
      claimed: claims.filter((c) => (c.season ?? 1) === seasonNo).map((c) => c.tier),
    },
    pastSeasons: seasons
      .filter((s) => s.ended_at)
      .sort((a, b) => b.n - a.n)
      .map((s) => ({ n: s.n, xp: s.final_xp ?? 0, endedAt: s.ended_at })),
    redeemed: redemptions.map((r) => ({
      receiptId: r.id,
      id: r.reward_id,
      title: r.title,
      cost: r.cost,
      icon: r.icon,
      hue: r.hue,
      tier: r.tier,
      redeemedAt: new Date(r.created_at).getTime(),
      usedAt: r.used_at ? new Date(r.used_at).getTime() : null,
      by: r.member_id,
    })),
    log: [...checks]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, LOG_LIMIT)
      .map((c) => ({
        id: c.id,
        memberId: c.member_id,
        habitId: c.habit_id,
        day: c.day,
        label: c.title,
        points: c.points,
        at: new Date(c.created_at).getTime(),
        proof: c.proof_path
          ? { path: c.proof_path, w: c.proof_w, h: c.proof_h }
          : null,
        cosigns: stamps.get(c.id) ?? [],
      })),
    stakes: stakesFrom(catalog),
    // Flattened for the recap: who gave a stamp, and on which day.
    stamps: (rows.cosigns ?? [])
      .map((c) => ({ memberId: c.member_id, day: byCheck.get(c.check_id) }))
      .filter((c) => c.day),
    weeks,
    week: {
      ...scoreWeek({
        history,
        members: roster,
        dailyGoal,
        weeklyGoal,
        start: weekStart(today),
        today,
      }),
      row: weeks.find((w) => w.start_day === weekStart(today)) ?? null,
    },
    // Every photo taken this week, newest first - the recap's raw material.
    proofs: checks
      .filter((c) => c.proof_path)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((c) => ({
        id: c.id,
        memberId: c.member_id,
        day: c.day,
        label: c.title,
        path: c.proof_path,
        w: c.proof_w,
        h: c.proof_h,
      })),
  }
}

const emptyRows = {
  household: null,
  members: [],
  checks: [],
  redemptions: [],
  claims: [],
  catalog: [],
  weeks: [],
  cosigns: [],
  seasons: [],
  before: 0,
}

export function useCloudGame() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [householdId, setHouseholdId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const activeIdRef = useRef(null)
  const [rows, setRows] = useState(emptyRows)
  const [today, setToday] = useState(todayKey())
  // 'idle' | 'saving' | 'error' | 'offline' - shown as a quiet dot, so a tap
  // on a patchy connection doesn't leave you guessing whether it counted.
  const [status, setStatus] = useState('idle')
  const [notice, setNotice] = useState(null)
  // Writes are queued first and replayed after, so going offline is the same
  // code path as being online, just slower to drain.
  const [queue, setQueue] = useState(loadQueue)
  const flushRef = useRef(null)
  const refetchTimer = useRef(null)
  const inFlight = useRef(0)
  const seenIds = useRef(null)
  const flushing = useRef(false)

  // Every write goes through here so the status dot reflects reality.
  const track = useCallback(async (run) => {
    inFlight.current += 1
    setStatus('saving')
    try {
      const result = await run()
      inFlight.current -= 1
      if (inFlight.current === 0) setStatus(navigator.onLine ? 'idle' : 'offline')
      return result
    } catch (e) {
      inFlight.current = Math.max(0, inFlight.current - 1)
      setStatus('error')
      setError(e.message ?? String(e))
      return null
    }
  }, [])

  useEffect(() => {
    const online = () => {
      setStatus((s) => (s === 'offline' ? 'idle' : s))
      flushRef.current?.()
    }
    const offline = () => setStatus('offline')
    if (!navigator.onLine) setStatus('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const fetchRows = useCallback(async (id) => {
    if (!id) return
    const since = shiftDay(todayKey(), -HISTORY_DAYS)

    const [
      household,
      members,
      checks,
      redemptions,
      claims,
      catalog,
      weeks,
      cosigns,
      seasons,
      before,
    ] = await Promise.all([
      supabase.from('households').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*').eq('household_id', id),
      supabase.from('habit_checks').select('*').eq('household_id', id).gte('day', since),
      supabase.from('redemptions').select('*').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('tier_claims').select('*').eq('household_id', id),
      supabase.from('catalog_items').select('*').eq('household_id', id),
      supabase.from('weeks').select('*').eq('household_id', id).order('start_day', { ascending: false }),
      supabase.from('cosigns').select('*').eq('household_id', id),
      supabase.from('seasons').select('*').eq('household_id', id).order('n', { ascending: false }),
      // Everything banked before the window above, so the bank is the whole
      // board's rather than the last six weeks of it.
      supabase.rpc('points_before', { p_household: id, p_day: since }),
    ])

    // Tables added by a later migration are optional: a household that
    // predates one simply has no rows there, which must not fail the read.
    const failure = [household, members, checks, redemptions, claims].find(
      (r) => r.error
    )
    if (failure) {
      setError(failure.error.message)
      return
    }

    setError(null)

    // Anything new from the other player, announced once.
    const incoming = [
      ...(checks.data ?? []).map((c) => ({
        id: `c-${c.id}`,
        memberId: c.member_id,
        text: `${c.title} · +${c.points}`,
        at: new Date(c.created_at).getTime(),
      })),
      ...(redemptions.data ?? []).map((r) => ({
        id: `r-${r.id}`,
        memberId: r.member_id,
        text: `redeemed ${r.title}`,
        at: new Date(r.created_at).getTime(),
      })),
    ]

    if (seenIds.current === null) {
      // First load is history, not news.
      seenIds.current = new Set(incoming.map((i) => i.id))
    } else {
      const fresh = incoming
        .filter((i) => !seenIds.current.has(i.id) && Date.now() - i.at < 120000)
        .sort((a, b) => b.at - a.at)
      incoming.forEach((i) => seenIds.current.add(i.id))

      const fromPartner = fresh.find((i) => i.memberId && i.memberId !== activeIdRef.current)
      if (fromPartner) {
        const who = (members.data ?? []).find((m) => m.id === fromPartner.memberId)
        setNotice({
          id: fromPartner.id,
          name: who?.name ?? 'Someone',
          text: fromPartner.text,
        })
      }
    }

    const next = {
      household: household.data,
      members: members.data ?? [],
      checks: checks.data ?? [],
      redemptions: redemptions.data ?? [],
      claims: claims.data ?? [],
      catalog: catalog.error ? [] : (catalog.data ?? []),
      weeks: weeks.error ? [] : (weeks.data ?? []),
      cosigns: cosigns.error ? [] : (cosigns.data ?? []),
      seasons: seasons.error ? [] : (seasons.data ?? []),
      // Zero on the older schema, which is what the bank used to assume anyway.
      before: before.error ? 0 : (before.data ?? 0),
    }
    setRows(next)
    cacheRows(id, next)
  }, [])

  // Realtime is a nudge, not a diff: any change just re-reads the board.
  const scheduleRefetch = useCallback(
    (id) => {
      clearTimeout(refetchTimer.current)
      refetchTimer.current = setTimeout(() => fetchRows(id), 120)
    },
    [fetchRows]
  )

  // Sign in anonymously, then find the household this device already joined.
  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      // Paint the last board we saw before touching the network, so opening
      // the app on a dead connection shows your grind, not the setup screen.
      const remembered = readHousehold()
      const offlineRows = remembered ? cachedRows(remembered) : null
      if (offlineRows && !cancelled) {
        setHouseholdId(remembered)
        setRows(offlineRows)
        setReady(true)
      }

      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          const { error: authError } = await supabase.auth.signInAnonymously()
          if (authError) throw authError
        }

        const { data: links, error: linkError } = await supabase
          .from('household_users')
          .select('household_id, member_id')
        if (linkError) throw linkError

        const link =
          links?.find((l) => l.household_id === remembered) ?? links?.[0] ?? null

        if (!cancelled && link) {
          setHouseholdId(link.household_id)
          setActiveId(link.member_id)
          rememberHousehold(link.household_id)
          await fetchRows(link.household_id)
        }
      } catch (e) {
        if (!cancelled) setError(e.message ?? String(e))
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [fetchRows])

  useEffect(() => {
    if (!householdId) return

    const filter = `household_id=eq.${householdId}`

    const listen = (channel, tables) => {
      for (const table of tables) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () =>
          scheduleRefetch(householdId)
        )
      }
      channel.subscribe()
      return channel
    }

    const core = listen(supabase.channel(`household:${householdId}`), [
      'habit_checks',
      'redemptions',
      'tier_claims',
      'members',
      'catalog_items',
    ])

    // Sunday Night's tables get their own channel. A binding to a table the
    // database doesn't have yet fails the whole channel it is on, so keeping
    // these separate means a board still syncing on the old schema loses the
    // week's live updates rather than all of them.
    const week = listen(supabase.channel(`household-week:${householdId}`), [
      'weeks',
      'cosigns',
    ])

    // Seasons came later still, and get their own for the same reason: a board
    // on the previous schema should lose the rollover's live update, not the
    // week's as well.
    const season = listen(supabase.channel(`household-season:${householdId}`), [
      'seasons',
    ])

    return () => {
      clearTimeout(refetchTimer.current)
      supabase.removeChannel(core)
      supabase.removeChannel(week)
      supabase.removeChannel(season)
    }
  }, [householdId, scheduleRefetch])

  // Coming back to the app can mean a new day, and a stale board.
  useEffect(() => {
    const check = () => {
      setToday(todayKey())
      if (householdId) fetchRows(householdId)
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [householdId, fetchRows])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  const dismissNotice = useCallback(() => setNotice(null), [])

  useEffect(() => {
    saveQueue(queue)
  }, [queue])

  const view = useMemo(
    () => project(applyPending(rows, queue), today),
    [rows, queue, today]
  )

  // A week settles itself the first time anyone opens the app after Sunday
  // evening, and catches up on any that were missed. Both phones will try
  // within seconds of each other: settle_week is idempotent, and this ref
  // stops one device asking twice in a session.
  const asked = useRef(new Set())

  useEffect(() => {
    if (!householdId || !ready || isOffline()) return

    const played = (from, to) =>
      view.history.some(
        (row) => row.day >= from && row.day <= to && Object.keys(row.totals).length > 0
      )

    const catchUp = async () => {
      const done = new Set(
        view.weeks.filter((w) => w.status === 'settled').map((w) => w.start_day)
      )
      const current = weekStart(today)
      let changed = false

      for (let back = SETTLE_BACKLOG; back >= 1; back -= 1) {
        const start = shiftDay(current, -7 * back)
        if (done.has(start) || asked.current.has(start)) continue
        if (!recapReady(start, today)) continue
        // A week nobody played has no recap worth opening.
        if (!played(start, shiftDay(start, 6))) continue

        asked.current.add(start)
        const { error: rpcError } = await supabase.rpc('settle_week', {
          p_household: householdId,
          p_start: start,
          p_today: today,
          p_week_target: weekTargetFor(view.dailyGoal, view.weeklyGoal),
        })
        if (!rpcError) changed = true
      }

      if (changed) fetchRows(householdId)
    }

    catchUp()
  }, [householdId, ready, today, view, fetchRows])


  // Replays queued writes in order. A failure stops the drain and leaves the
  // rest queued, so nothing is dropped and order is preserved.
  const runOp = useCallback(
    async (op) => {
      switch (op.type) {
        case 'proof.upload': {
          const blob = await getProof(op.key)
          // The blob is gone - cleared cache, another device, a wiped store.
          // Nothing to retry forever over.
          if (!blob) return { error: null }

          const { error: uploadError } = await supabase.storage
            .from(PROOF_BUCKET)
            .upload(op.path, blob, { contentType: blob.type, upsert: true })
          if (uploadError) return { error: uploadError }

          const { error: linkError } = await supabase
            .from('habit_checks')
            .update({ proof_path: op.path, proof_w: op.w, proof_h: op.h })
            .match({ household_id: householdId, ...op.match })
          if (linkError) return { error: linkError }

          removeProof(op.key)
          return { error: null }
        }
        case 'proof.remove':
          await supabase.storage.from(PROOF_BUCKET).remove([op.path])
          return supabase
            .from('habit_checks')
            .update({ proof_path: null, proof_w: null, proof_h: null })
            .match({ household_id: householdId, ...op.match })
        case 'cosign.add':
          return supabase
            .from('cosigns')
            .upsert(op.row, { onConflict: 'check_id,member_id' })
        case 'cosign.remove':
          return supabase.from('cosigns').delete().match(op.match)
        case 'check.add':
          return supabase
            .from('habit_checks')
            .upsert(op.row, { onConflict: 'household_id,member_id,habit_id,day' })
        case 'check.remove':
          return supabase.from('habit_checks').delete().match(op.match)
        case 'coupon.set':
          return supabase
            .from('redemptions')
            .update({ used_at: op.usedAt })
            .eq('id', op.receiptId)
        case 'catalog.upsert':
          return supabase
            .from('catalog_items')
            .upsert(op.row, { onConflict: 'household_id,kind,item_id' })
        case 'catalog.remove':
          return supabase
            .from('catalog_items')
            .delete()
            .match({ household_id: householdId, kind: op.kind, item_id: op.itemId })
        default:
          return { error: null }
      }
    },
    [householdId]
  )

  /**
   * Replays queued writes in order.
   *
   * The queue is re-read from storage after every op rather than sliced from a
   * copy taken at the start. A write made while this is awaiting the network -
   * a second check-off, or the photo removal that rides along with an undo -
   * lands in storage behind our back, and saving a stale copy over the top of
   * it dropped it silently.
   *
   * A photo that fails is skipped for the rest of the pass rather than
   * retried: a sulking upload must never hold up the points behind it. It
   * stays in the queue and goes again next time.
   */
  const flush = useCallback(async () => {
    if (flushing.current || isOffline()) return
    flushing.current = true

    try {
      const skip = new Set()

      for (;;) {
        const pending = loadQueue()
        const op = pending.find((candidate) => !skip.has(candidate.id))
        if (!op) break

        setStatus('saving')
        const { error: opError } = await runOp(op)

        if (opError) {
          // A photo is allowed to sulk without holding up the points behind it.
          if (op.type === 'proof.upload') {
            skip.add(op.id)
            continue
          }

          if (worthRetrying(opError)) {
            setStatus('error')
            setError(opError.message)
            return
          }

          // Nothing will ever make this one land. Drop it and keep going, or
          // it blocks every write made after it for good.
          const rest = loadQueue().filter((candidate) => candidate.id !== op.id)
          saveQueue(rest)
          setQueue(rest)
          setNotice({
            id: `dropped-${op.id}`,
            icon: 'lock',
            title: 'Not saved',
            text: DROPPED[op.type] ?? 'Something did not save.',
          })
          continue
        }

        // Re-read: anything enqueued while that op was in flight is in here
        // too, and must survive.
        const rest = loadQueue().filter((candidate) => candidate.id !== op.id)
        saveQueue(rest)
        setQueue(rest)
      }

      setStatus(skip.size > 0 ? 'saving' : isOffline() ? 'offline' : 'idle')
      if (householdId) fetchRows(householdId)
    } finally {
      flushing.current = false
    }
  }, [runOp, householdId, fetchRows])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  // A queue can outlive the page: writes made offline are still waiting on the
  // next launch, so drain as soon as we know which household we are.
  useEffect(() => {
    if (householdId && queue.length > 0) flush()
  }, [householdId, queue.length, flush])

  const enqueue = useCallback(
    (op) => {
      const next = [...loadQueue(), { id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), ...op }]
      saveQueue(next)
      setQueue(next)
      if (isOffline()) setStatus('offline')
      else flush()
    },
    [flush]
  )

  const start = useCallback(
    async (names) => {
      const { data, error: rpcError } = await supabase.rpc('create_household', {
        p_names: names,
      })
      if (rpcError) return setError(rpcError.message)

      const created = Array.isArray(data) ? data[0] : data
      setHouseholdId(created.household_id)
      rememberHousehold(created.household_id)
      await fetchRows(created.household_id)

      const { data: link } = await supabase
        .from('household_users')
        .select('member_id')
        .eq('household_id', created.household_id)
        .maybeSingle()
      setActiveId(link?.member_id ?? null)
    },
    [fetchRows]
  )

  const join = useCallback(
    async (code) => {
      const { data, error: rpcError } = await supabase.rpc('join_household', {
        p_code: code,
      })
      if (rpcError) return setError(rpcError.message)

      setHouseholdId(data)
      rememberHousehold(data)
      setActiveId(null)
      await fetchRows(data)
    },
    [fetchRows]
  )

  /**
   * Which of the two players this device is.
   *
   * It has to be written down, not just held in React. The cosigns policy asks
   * whether the member on the row is the member this device is linked to, and
   * `mark_recap_opened` records whoever that link names. Switching profiles on
   * a shared phone while the server still thought we were the other one meant
   * every stamp came back as a policy violation - and, worse, sat at the head
   * of the queue refusing to drain.
   *
   * Used for the first pick after joining and for every switch after it: they
   * are the same act.
   */
  const pickMember = useCallback(
    async (memberId) => {
      setActiveId(memberId)
      if (!householdId) return
      const { error: updateError } = await supabase
        .from('household_users')
        .update({ member_id: memberId })
        .eq('household_id', householdId)
      if (updateError) setError(updateError.message)
    },
    [householdId]
  )

  const toggleHabit = useCallback(
    async (habit) => {
      if (!householdId || !activeId) return

      // A weekly habit is ticked for the week, so un-ticking has to delete the
      // row on whichever day it was actually made.
      const checkedDay =
        habit.kind === 'weekly'
          ? (view.grind.weekDone?.[activeId]?.[habit.id] ?? null)
          : view.grind.done[activeId]?.includes(habit.id)
            ? today
            : null

      // Unchecking claws points back out of the shared bank, so it has to cover them.
      if (checkedDay && view.balance < habit.points) return

      // A check-off that is going away takes its photo with it. The row is
      // about to be deleted, so nothing would point at the object afterwards
      // and it would sit in the bucket for good.
      if (checkedDay) {
        const shot = rows.checks.find(
          (c) =>
            c.member_id === activeId &&
            c.habit_id === habit.id &&
            c.day === checkedDay &&
            c.proof_path
        )
        if (shot) {
          enqueue({
            type: 'proof.remove',
            path: shot.proof_path,
            match: { member_id: activeId, habit_id: habit.id, day: checkedDay },
          })
        }
      }

      enqueue(
        checkedDay
          ? {
              type: 'check.remove',
              match: {
                household_id: householdId,
                member_id: activeId,
                habit_id: habit.id,
                day: checkedDay,
              },
            }
          : {
              type: 'check.add',
              row: {
                household_id: householdId,
                member_id: activeId,
                habit_id: habit.id,
                title: habit.title,
                day: today,
                points: habit.points,
              },
            }
      )
    },
    [householdId, activeId, today, view, rows, enqueue]
  )

  // ---- proof, stamps and the week ---------------------------------------

  /**
   * Attaches a photo to a check-off. The point is already banked by the time
   * this runs and nothing here can take it back: the photo is queued, and if
   * it never uploads the check-off is simply one without a picture.
   */
  const attachProof = useCallback(
    async (habit, file) => {
      if (!householdId || !activeId) return
      const shot = await prepare(file)
      if (!shot) return

      // The day the check-off was made, which for a weekly habit ticked
      // earlier in the week is not today. Naming the photo after today would
      // upload it against a row that does not exist.
      const day = habit.day ?? today
      const path = proofPathFor(householdId, activeId, habit.id, day, shot.ext)
      await putProof(path, shot.blob)
      enqueue({
        type: 'proof.upload',
        key: path,
        path,
        w: shot.width,
        h: shot.height,
        match: { member_id: activeId, habit_id: habit.id, day },
      })
    },
    [householdId, activeId, today, enqueue]
  )

  const clearProof = useCallback(
    (habit, path) => {
      if (!householdId || !activeId || !path) return
      removeProof(path)
      enqueue({
        type: 'proof.remove',
        path,
        match: { member_id: activeId, habit_id: habit.id, day: habit.day ?? today },
      })
    },
    [householdId, activeId, today, enqueue]
  )

  // Stamping the other player's check-off. Worth no points on purpose - see
  // the migration. You cannot stamp your own; the policy says so too.
  const cosign = useCallback(
    (checkId, stamp = 'star') => {
      if (!householdId || !activeId) return
      enqueue({
        type: 'cosign.add',
        row: {
          check_id: checkId,
          household_id: householdId,
          member_id: activeId,
          stamp,
        },
      })
    },
    [householdId, activeId, enqueue]
  )

  const uncosign = useCallback(
    (checkId) => {
      if (!activeId) return
      enqueue({ type: 'cosign.remove', match: { check_id: checkId, member_id: activeId } })
    },
    [activeId, enqueue]
  )

  // Slot 1 or 2 puts up that player's stake; slot 0 is the shared prize for
  // clearing the week together.
  const openWeek = useCallback(
    async (slot, stake) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Putting up a stake needs a connection.')
        return
      }
      await track(async () => {
        const { error: rpcError } = await supabase.rpc('open_week', {
          p_household: householdId,
          p_start: weekStart(today),
          p_slot: slot,
          p_stake: stake,
        })
        if (rpcError) throw rpcError
      })
      fetchRows(householdId)
    },
    [householdId, today, fetchRows, track]
  )

  const markRecapOpened = useCallback(
    async (start) => {
      if (!householdId || isOffline()) return
      await supabase.rpc('mark_recap_opened', {
        p_household: householdId,
        p_start: start,
      })
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  // The agreed multiplier for the week. A members update, like picking who you
  // are is - rare enough not to be worth queueing, and the week is scored on
  // the server from this column anyway.
  const setHandicap = useCallback(
    async (memberId, value) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Changing the handicap needs a connection.')
        return
      }
      const { error: updateError } = await supabase
        .from('members')
        .update({ handicap: value })
        .eq('id', memberId)
        .eq('household_id', householdId)
      if (updateError) setError(updateError.message)
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  // Pinning something to save for. `households` is read-only by policy - the
  // seed balance lives there - so this goes through a function.
  const setWish = useCallback(
    async (rewardId) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Pinning a reward needs a connection.')
        return
      }
      const { error: rpcError } = await supabase.rpc('set_wish', {
        p_household: householdId,
        p_reward_id: rewardId,
      })
      if (rpcError) setError(rpcError.message)
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  /**
   * Everything a recap needs for one past week.
   *
   * The board only reads the last few weeks of check rows, so a Sunday further
   * back than that has no chart and no reel to show. Opening one asks for its
   * week directly rather than widening the window for every launch.
   */
  const loadWeek = useCallback(
    async (start) => {
      if (!householdId || isOffline()) return null
      const days = weekDays(start)
      const end = days[days.length - 1]

      const [checks, stampRows] = await Promise.all([
        supabase
          .from('habit_checks')
          .select('*')
          .eq('household_id', householdId)
          .gte('day', start)
          .lte('day', end),
        supabase.from('cosigns').select('*').eq('household_id', householdId),
      ])
      if (checks.error) return null

      const rows = checks.data ?? []
      const byDay = new Map()
      const byMemberDay = new Map()
      for (const check of rows) {
        const day = byDay.get(check.day) ?? {}
        day[check.member_id] = (day[check.member_id] ?? 0) + check.points
        byDay.set(check.day, day)

        const key = `${check.member_id}|${check.day}`
        byMemberDay.set(key, (byMemberDay.get(key) ?? 0) + 1)
      }

      const goalDates = {}
      for (const [key, count] of byMemberDay) {
        const [memberId, day] = key.split('|')
        if (count >= STREAK_MIN_CHECKS) {
          goalDates[memberId] = [...(goalDates[memberId] ?? []), day]
        }
      }

      const dayOf = new Map(rows.map((c) => [c.id, c.day]))

      return {
        history: days.map((day) => ({ day, totals: byDay.get(day) ?? {} })),
        goalDates,
        proofs: rows
          .filter((c) => c.proof_path)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map((c) => ({
            id: c.id,
            memberId: c.member_id,
            day: c.day,
            label: c.title,
            path: c.proof_path,
            w: c.proof_w,
            h: c.proof_h,
          })),
        stamps: (stampRows.data ?? [])
          .map((c) => ({ memberId: c.member_id, day: dayOf.get(c.check_id) }))
          .filter((c) => c.day),
      }
    },
    [householdId]
  )

  /**
   * Lets old weeks give up most of their photos. The check rows keep their
   * points and their place in the log; only the picture goes, and only for
   * weeks well outside the window this backend reads - see data/proof.
   *
   * Those rows are older than `fetchRows` looks, so this asks for them
   * directly rather than working from what is already loaded, and nothing on
   * screen changes when it finishes.
   */
  const thinOldProofs = useCallback(async () => {
    if (!householdId || isOffline()) return { removed: 0 }

    const { data, error: readError } = await supabase
      .from('habit_checks')
      .select('id, day, proof_path, created_at')
      .eq('household_id', householdId)
      .lt('day', thinBefore(today))
      .not('proof_path', 'is', null)
    if (readError || !data?.length) return { removed: 0 }

    const doomed = thinnable(
      data.map((row) => ({ ...row, at: new Date(row.created_at).getTime() })),
      today
    )
    if (doomed.length === 0) return { removed: 0 }

    // In batches, because the first pass on a board that has been going a
    // while can find hundreds at once, and an `in` list that long is a URL
    // nobody accepts. A batch that fails just leaves its photos for next time.
    let removed = 0
    for (let from = 0; from < doomed.length; from += THIN_BATCH) {
      const batch = doomed.slice(from, from + THIN_BATCH)
      const paths = batch.map((shot) => shot.proof_path)

      // Storage first: a row still pointing at a deleted object shows a broken
      // photo, but an object with no row pointing at it is just a byte nobody
      // asks for, and the next pass will not see it again either way.
      const { error: removeError } = await supabase.storage.from(PROOF_BUCKET).remove(paths)
      if (removeError) break
      paths.forEach((path) => signed.delete(path))

      const { error: clearError } = await supabase
        .from('habit_checks')
        .update({ proof_path: null, proof_w: null, proof_h: null })
        .in('id', batch.map((shot) => shot.id))
      if (clearError) break

      removed += batch.length
    }

    return { removed }
  }, [householdId, today])

  /**
   * Deletes objects in the bucket that no check-off points at any more.
   *
   * Thinning only ever looks at rows that still carry a path, so a photo whose
   * check-off was deleted is invisible to it and stays for good. This is the
   * pass that collects those.
   *
   * It compares against every referenced path on the board rather than the
   * ones in the loaded window - a photo on a three-month-old check-off is
   * still somebody's photo - and leaves anything uploaded in the last day
   * alone, because a photo is uploaded a moment before it is linked and the
   * phone uploading may not be the phone sweeping.
   */
  const sweepOrphans = useCallback(async () => {
    if (!householdId || isOffline()) return { removed: 0 }

    // A queued upload is an object with no row pointing at it yet, on purpose.
    if (loadQueue().some((op) => op.type === 'proof.upload')) return { removed: 0 }

    const { data: linked, error: readError } = await supabase
      .from('habit_checks')
      .select('proof_path')
      .eq('household_id', householdId)
      .not('proof_path', 'is', null)
    if (readError) return { removed: 0 }

    const objects = []
    for (let offset = 0; ; offset += SWEEP_PAGE) {
      const { data: page, error: listError } = await supabase.storage
        .from(PROOF_BUCKET)
        .list(householdId, { limit: SWEEP_PAGE, offset })
      if (listError) return { removed: 0 }
      for (const object of page ?? []) {
        objects.push({ path: `${householdId}/${object.name}`, createdAt: object.created_at })
      }
      if (!page || page.length < SWEEP_PAGE) break
    }

    const doomed = orphansIn(
      objects,
      linked.map((row) => row.proof_path)
    )
    if (doomed.length === 0) return { removed: 0 }

    let removed = 0
    for (let from = 0; from < doomed.length; from += THIN_BATCH) {
      const paths = doomed.slice(from, from + THIN_BATCH).map((o) => o.path)
      const { error: removeError } = await supabase.storage.from(PROOF_BUCKET).remove(paths)
      if (removeError) break
      paths.forEach((path) => signed.delete(path))
      removed += paths.length
    }

    return { removed }
  }, [householdId])

  // Once a session, after the board is up. Both phones may run it; the second
  // one simply finds nothing left to do. Thinning goes first: it deletes both
  // the object and the row's path, so the sweep behind it sees no trace.
  const thinnedThisSession = useRef(false)

  useEffect(() => {
    if (!householdId || !ready || isOffline() || thinnedThisSession.current) return
    thinnedThisSession.current = true
    thinOldProofs().then(sweepOrphans)
  }, [householdId, ready, thinOldProofs, sweepOrphans])

  const redeem = useCallback(
    async (reward) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Checkout needs a connection - the bank is checked on the server.')
        return
      }
      await track(async () => {
        const { error: rpcError } = await supabase.rpc('redeem_reward', {
          p_household: householdId,
          p_member: activeId,
          p_reward_id: reward.id,
          p_title: reward.title,
          p_cost: reward.cost,
          p_icon: reward.icon,
          p_hue: reward.hue,
          p_tier: reward.tier,
        })
        if (rpcError) throw rpcError
      })
      fetchRows(householdId)
    },
    [householdId, activeId, fetchRows, track]
  )

  /**
   * Closes the finished season and opens the next one. Server-checked like
   * claiming is, and idempotent there, so both phones pressing it at once
   * rolls over exactly once.
   */
  const endSeason = useCallback(
    async (required, season) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Rolling over needs a connection - the season is closed on the server.')
        return
      }
      await track(async () => {
        const { error: rpcError } = await supabase.rpc('end_season', {
          p_household: householdId,
          p_required: required,
          // Which season this phone thinks it is ending. If the other one got
          // there first the server returns quietly rather than refusing a
          // rollover that already happened.
          p_season: season ?? null,
        })
        if (rpcError) throw rpcError
      })
      fetchRows(householdId)
    },
    [householdId, fetchRows, track]
  )

  const claimTier = useCallback(
    async (tier) => {
      if (!householdId) return
      if (isOffline()) {
        setError('Claiming needs a connection - tiers are checked on the server.')
        return
      }
      const { error: rpcError } = await supabase.rpc('claim_tier', {
        p_household: householdId,
        p_tier: tier.n,
        p_xp_required: tier.xp,
        p_bonus: tier.type === 'bonus' ? tier.value : 0,
        p_member: activeId,
      })
      if (rpcError) setError(rpcError.message)
      fetchRows(householdId)
    },
    [householdId, activeId, fetchRows]
  )

  // ---- developer tools -------------------------------------------------
  // Writes go through the same tables as real play, so anything seeded here
  // syncs to the other device exactly like a real check-off would.

  const insertChecks = useCallback(
    async (rows) => {
      if (!householdId || !activeId || rows.length === 0) return
      const { error: insertError } = await supabase
        .from('habit_checks')
        .upsert(
          rows.map((r) => ({ household_id: householdId, member_id: activeId, ...r })),
          { onConflict: 'household_id,member_id,habit_id,day' }
        )
      if (insertError) setError(insertError.message)
      fetchRows(householdId)
    },
    [householdId, activeId, fetchRows]
  )

  const setCouponUsed = useCallback(
    (receiptId, used) =>
      enqueue({
        type: 'coupon.set',
        receiptId,
        usedAt: used ? new Date().toISOString() : null,
      }),
    [enqueue]
  )

  const addCatalogItem = useCallback(
    (kind, payload) => {
      if (!householdId) return
      const itemId = slugify(payload.title)
      enqueue({
        type: 'catalog.upsert',
        row: {
          household_id: householdId,
          kind,
          item_id: itemId,
          hidden: false,
          payload: { ...payload, hue: hueFor(itemId) },
        },
      })
    },
    [householdId, enqueue]
  )

  // Editing a built-in stores an override row rather than changing code.
  const editCatalogItem = useCallback(
    (kind, itemId, payload) => {
      if (!householdId) return
      enqueue({
        type: 'catalog.upsert',
        row: { household_id: householdId, kind, item_id: itemId, hidden: false, payload },
      })
    },
    [householdId, enqueue]
  )

  // Custom entries are dropped; built-ins are only switched off, since they
  // live in code and would come back on the next load anyway.
  const removeCatalogItem = useCallback(
    (kind, itemId, isCustom) => {
      if (!householdId) return
      enqueue(
        isCustom
          ? { type: 'catalog.remove', kind, itemId }
          : {
              type: 'catalog.upsert',
              row: {
                household_id: householdId,
                kind,
                item_id: itemId,
                hidden: true,
                payload: null,
              },
            }
      )
    },
    [householdId, enqueue]
  )

  // habit_checks only holds positive points, so taking points back means
  // deleting earlier grants rather than inserting a negative row.
  const devGrant = useCallback(
    async (requested) => {
      if (requested > 0) {
        return insertChecks([
          {
            habit_id: `dev-grant-${Date.now()}`,
            title: 'Dev grant',
            day: today,
            points: requested,
          },
        ])
      }

      let owed = Math.min(-requested, view.balance)
      const grants = rows.checks
        .filter((c) => c.habit_id.startsWith('dev-grant-'))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      const doomed = []
      for (const grant of grants) {
        if (owed <= 0) break
        if (grant.points > owed) continue
        doomed.push(grant.id)
        owed -= grant.points
      }

      if (doomed.length === 0) return
      const { error: deleteError } = await supabase
        .from('habit_checks')
        .delete()
        .in('id', doomed)
      if (deleteError) setError(deleteError.message)
      fetchRows(householdId)
    },
    [insertChecks, today, view, rows, householdId, fetchRows]
  )

  const devCompleteDaily = useCallback(
    () =>
      insertChecks(
        view.dailyHabits.map((h) => ({
          habit_id: h.id,
          title: h.title,
          day: today,
          points: h.points,
        }))
      ),
    [insertChecks, today, view]
  )

  const devClearToday = useCallback(async () => {
    if (!householdId || !activeId) return
    const { error: deleteError } = await supabase
      .from('habit_checks')
      .delete()
      .match({ household_id: householdId, member_id: activeId, day: today })
    if (deleteError) setError(deleteError.message)
    fetchRows(householdId)
  }, [householdId, activeId, today, fetchRows])

  // Backfills cleared days so the streak strip has something to show.
  const devSeedHistory = useCallback(
    (days) => {
      const rows = []
      for (let i = 1; i <= days; i += 1) {
        const day = shiftDay(today, -i)
        for (const h of view.dailyHabits) {
          rows.push({ habit_id: h.id, title: h.title, day, points: h.points })
        }
      }
      return insertChecks(rows)
    },
    [insertChecks, today, view]
  )

  /**
   * Wipes the economy back to a fresh board for both players. Habit checks
   * always go; receipts and tier claims need the optional delete policies from
   * supabase/dev-reset.sql, since normal play only ever inserts them through
   * the spending functions. Reports what it could not remove rather than
   * failing silently.
   */
  const devClearPoints = useCallback(async () => {
    if (!householdId) return { cleared: [], kept: [] }

    const wipe = async (table) => {
      const { error: wipeError } = await supabase
        .from(table)
        .delete()
        .eq('household_id', householdId)
      return wipeError ? null : table
    }

    const results = await Promise.all(
      ['habit_checks', 'redemptions', 'tier_claims', 'weeks', 'cosigns', 'seasons'].map(
        wipe
      )
    )

    const names = {
      habit_checks: 'points',
      redemptions: 'receipts',
      tier_claims: 'tier claims',
      weeks: 'weeks',
      cosigns: 'stamps',
      seasons: 'seasons',
    }
    asked.current.clear()
    const cleared = results.filter(Boolean).map((t) => names[t])
    const kept = Object.keys(names)
      .filter((t) => !results.includes(t))
      .map((t) => names[t])

    fetchRows(householdId)
    return { cleared, kept }
  }, [householdId, fetchRows])

  // Settles a week without waiting for Sunday evening. The server still
  // refuses to score one that hasn't finished.
  const devSettleWeek = useCallback(
    async (start) => {
      if (!householdId) return
      asked.current.delete(start)
      const { error: rpcError } = await supabase.rpc('settle_week', {
        p_household: householdId,
        p_start: start,
        p_today: today,
        p_week_target: weekTargetFor(view.dailyGoal, view.weeklyGoal),
      })
      if (rpcError) setError(rpcError.message)
      fetchRows(householdId)
    },
    [householdId, today, view, fetchRows]
  )

  // Drops this device off the board without touching the shared data.
  const devForget = useCallback(async () => {
    await supabase.auth.signOut()
    try {
      localStorage.removeItem(HOUSEHOLD_KEY)
    } catch {
      /* nothing to clear */
    }
    location.reload()
  }, [])

  return {
    mode: 'cloud',
    ready,
    error,
    ...view,
    // No household yet, or joined but haven't said who you are.
    members: householdId ? view.members : null,
    activeId,
    start,
    join,
    pickMember,
    switchMember: pickMember,
    toggleHabit,
    redeem,
    claimTier,
    setCouponUsed,
    addCatalogItem,
    editCatalogItem,
    removeCatalogItem,
    attachProof,
    clearProof,
    proofUrl: signProof,
    cosign,
    uncosign,
    openWeek,
    markRecapOpened,
    endSeason,
    setHandicap,
    setWish,
    loadWeek,
    status: queue.length > 0 && status !== 'error' ? (isOffline() ? 'offline' : 'saving') : status,
    pending: queue.length,
    notice,
    dismissNotice,
    dev: {
      grant: devGrant,
      completeDaily: devCompleteDaily,
      clearToday: devClearToday,
      clearPoints: devClearPoints,
      seedHistory: devSeedHistory,
      settleWeek: devSettleWeek,
      // A single point is enough for the server: the twelve-tier gate is the
      // client's, and this is the tool for not waiting on it.
      endSeason: () => endSeason(1, view.season?.n),
      thinProofs: async () => {
        const thinned = await thinOldProofs()
        const swept = await sweepOrphans()
        return { removed: thinned.removed, swept: swept.removed }
      },
      forget: devForget,
      refresh: () => fetchRows(householdId),
    },
  }
}
