import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  bonusHabitsFrom,
  dailyHabitsFrom,
  hueFor,
  rewardsFrom,
  slugify,
  stakesFrom,
} from '../data/catalog'
import { recentDays, shiftDay, today as todayKey } from '../lib/day'
import { minTargetFor, recapReady, scoreWeek, weekStart } from '../data/week'
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
    .map((m) => ({ id: m.id, name: m.name, slot: m.slot }))

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

  // A day counts toward the streak when that member cleared every daily habit.
  const goalDates = {}
  for (const [key, habitIds] of byMemberDay) {
    const [memberId, day] = key.split('|')
    const cleared = new Set(habitIds)
    if (dailyHabits.every((h) => cleared.has(h.id))) {
      goalDates[memberId] = [...(goalDates[memberId] ?? []), day]
    }
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

  const dailyGoal = dailyHabits.reduce((sum, h) => sum + h.points, 0)
  const spent = redemptions.reduce((sum, r) => sum + r.cost, 0)
  const bonuses = claims.reduce((sum, c) => sum + (c.bonus ?? 0), 0)
  const xp = checks.reduce((sum, c) => sum + c.points, 0)

  return {
    code: household?.code ?? null,
    members: roster,
    history,
    dailyHabits,
    bonusHabits: bonusHabitsFrom(catalog),
    dailyGoal,
    rewards: rewardsFrom(catalog),
    balance: (household?.seed_balance ?? 0) + xp + bonuses - spent,
    earned,
    grind: { date: today, done, goalDates },
    season: { xp, claimed: claims.map((c) => c.tier) },
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
      ...scoreWeek({ history, members: roster, dailyGoal, start: weekStart(today), today }),
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

    const [household, members, checks, redemptions, claims, catalog, weeks, cosigns] =
      await Promise.all([
      supabase.from('households').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*').eq('household_id', id),
      supabase.from('habit_checks').select('*').eq('household_id', id).gte('day', since),
      supabase.from('redemptions').select('*').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('tier_claims').select('*').eq('household_id', id),
      supabase.from('catalog_items').select('*').eq('household_id', id),
      supabase.from('weeks').select('*').eq('household_id', id).order('start_day', { ascending: false }),
      supabase.from('cosigns').select('*').eq('household_id', id),
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

    return () => {
      clearTimeout(refetchTimer.current)
      supabase.removeChannel(core)
      supabase.removeChannel(week)
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
          p_min_target: minTargetFor(view.dailyGoal),
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

  const flush = useCallback(async () => {
    if (flushing.current || isOffline()) return
    flushing.current = true

    try {
      let pending = loadQueue()
      // Photos that failed sit here and go back on the queue at the end, so a
      // sulking upload can't hold up the check-offs behind it. Points first.
      const deferred = []

      while (pending.length > 0) {
        const [op] = pending
        setStatus('saving')
        const { error: opError } = await runOp(op)

        if (opError) {
          if (op.type === 'proof.upload') {
            deferred.push(op)
            pending = pending.slice(1)
            saveQueue([...pending, ...deferred])
            setQueue([...pending, ...deferred])
            continue
          }
          setStatus('error')
          setError(opError.message)
          return
        }

        pending = pending.slice(1)
        saveQueue([...pending, ...deferred])
        setQueue([...pending, ...deferred])
      }

      setStatus(deferred.length > 0 ? 'saving' : isOffline() ? 'offline' : 'idle')
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

  // After joining by code you pick which of the two players you are.
  const pickMember = useCallback(
    async (memberId) => {
      setActiveId(memberId)
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

      const checkedToday = view.grind.done[activeId]?.includes(habit.id)

      // Unchecking claws points back out of the shared bank, so it has to cover them.
      if (checkedToday && view.balance < habit.points) return

      enqueue(
        checkedToday
          ? {
              type: 'check.remove',
              match: {
                household_id: householdId,
                member_id: activeId,
                habit_id: habit.id,
                day: today,
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
    [householdId, activeId, today, view, enqueue]
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

      const path = proofPathFor(householdId, activeId, habit.id, today, shot.ext)
      await putProof(path, shot.blob)
      enqueue({
        type: 'proof.upload',
        key: path,
        path,
        w: shot.width,
        h: shot.height,
        match: { member_id: activeId, habit_id: habit.id, day: today },
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
      ['habit_checks', 'redemptions', 'tier_claims', 'weeks', 'cosigns'].map(wipe)
    )

    const names = {
      habit_checks: 'points',
      redemptions: 'receipts',
      tier_claims: 'tier claims',
      weeks: 'weeks',
      cosigns: 'stamps',
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
        p_min_target: minTargetFor(view.dailyGoal),
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
    switchMember: setActiveId,
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
      forget: devForget,
      refresh: () => fetchRows(householdId),
    },
  }
}
