import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  bonusHabitsFrom,
  dailyHabitsFrom,
  hueFor,
  rewardsFrom,
  slugify,
} from '../data/catalog'
import { shiftDay, today as todayKey } from '../lib/day'

// Supabase-backed mode: two devices, one board.
//
// Nothing stores a balance. Points are derived from the rows every time, so
// two phones checking things off at the same moment can't clobber each other.

const HOUSEHOLD_KEY = 'tgbp.household'
const HISTORY_DAYS = 45
const LOG_LIMIT = 40

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
  const dailyHabits = dailyHabitsFrom(catalog)

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

  const spent = redemptions.reduce((sum, r) => sum + r.cost, 0)
  const bonuses = claims.reduce((sum, c) => sum + (c.bonus ?? 0), 0)
  const xp = checks.reduce((sum, c) => sum + c.points, 0)

  return {
    code: household?.code ?? null,
    members: roster,
    dailyHabits,
    bonusHabits: bonusHabitsFrom(catalog),
    dailyGoal: dailyHabits.reduce((sum, h) => sum + h.points, 0),
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
        label: c.title,
        points: c.points,
        at: new Date(c.created_at).getTime(),
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
  const refetchTimer = useRef(null)
  const inFlight = useRef(0)
  const seenIds = useRef(null)

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
    const online = () => setStatus((s) => (s === 'offline' ? 'idle' : s))
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

    const [household, members, checks, redemptions, claims, catalog] =
      await Promise.all([
      supabase.from('households').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*').eq('household_id', id),
      supabase.from('habit_checks').select('*').eq('household_id', id).gte('day', since),
      supabase.from('redemptions').select('*').eq('household_id', id).order('created_at', { ascending: false }),
      supabase.from('tier_claims').select('*').eq('household_id', id),
      supabase.from('catalog_items').select('*').eq('household_id', id),
    ])

    // A household that predates the catalog migration simply has none.
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

    setRows({
      household: household.data,
      members: members.data ?? [],
      checks: checks.data ?? [],
      redemptions: redemptions.data ?? [],
      claims: claims.data ?? [],
      catalog: catalog.error ? [] : (catalog.data ?? []),
    })
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

        const remembered = readHousehold()
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
    const channel = supabase.channel(`household:${householdId}`)

    for (const table of [
      'habit_checks',
      'redemptions',
      'tier_claims',
      'members',
      'catalog_items',
    ]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () =>
        scheduleRefetch(householdId)
      )
    }

    channel.subscribe()
    return () => {
      clearTimeout(refetchTimer.current)
      supabase.removeChannel(channel)
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

  const view = useMemo(() => project(rows, today), [rows, today])

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

      await track(async () => {
        const { error: writeError } = checkedToday
          ? await supabase.from('habit_checks').delete().match({
              household_id: householdId,
              member_id: activeId,
              habit_id: habit.id,
              day: today,
            })
          : await supabase.from('habit_checks').insert({
              household_id: householdId,
              member_id: activeId,
              habit_id: habit.id,
              title: habit.title,
              day: today,
              points: habit.points,
            })
        if (writeError) throw writeError
      })

      fetchRows(householdId)
    },
    [householdId, activeId, today, view, fetchRows, track]
  )

  const redeem = useCallback(
    async (reward) => {
      if (!householdId) return
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
    async (receiptId, used) => {
      const { error: updateError } = await supabase
        .from('redemptions')
        .update({ used_at: used ? new Date().toISOString() : null })
        .eq('id', receiptId)
      if (updateError) setError(updateError.message)
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  const addCatalogItem = useCallback(
    async (kind, payload) => {
      if (!householdId) return
      const itemId = slugify(payload.title)
      const { error: insertError } = await supabase.from('catalog_items').insert({
        household_id: householdId,
        kind,
        item_id: itemId,
        payload: { ...payload, hue: hueFor(itemId) },
      })
      if (insertError) setError(insertError.message)
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  // Editing a built-in stores an override row rather than changing code.
  const editCatalogItem = useCallback(
    async (kind, itemId, payload) => {
      if (!householdId) return
      const { error: upsertError } = await supabase.from('catalog_items').upsert(
        { household_id: householdId, kind, item_id: itemId, hidden: false, payload },
        { onConflict: 'household_id,kind,item_id' }
      )
      if (upsertError) setError(upsertError.message)
      fetchRows(householdId)
    },
    [householdId, fetchRows]
  )

  // Custom entries are dropped; built-ins are only switched off, since they
  // live in code and would come back on the next load anyway.
  const removeCatalogItem = useCallback(
    async (kind, itemId, isCustom) => {
      if (!householdId) return

      if (isCustom) {
        const { error: deleteError } = await supabase
          .from('catalog_items')
          .delete()
          .match({ household_id: householdId, kind, item_id: itemId })
        if (deleteError) setError(deleteError.message)
      } else {
        const { error: upsertError } = await supabase.from('catalog_items').upsert(
          { household_id: householdId, kind, item_id: itemId, hidden: true, payload: null },
          { onConflict: 'household_id,kind,item_id' }
        )
        if (upsertError) setError(upsertError.message)
      }

      fetchRows(householdId)
    },
    [householdId, fetchRows]
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
      ['habit_checks', 'redemptions', 'tier_claims'].map(wipe)
    )

    const names = {
      habit_checks: 'points',
      redemptions: 'receipts',
      tier_claims: 'tier claims',
    }
    const cleared = results.filter(Boolean).map((t) => names[t])
    const kept = Object.keys(names)
      .filter((t) => !results.includes(t))
      .map((t) => names[t])

    fetchRows(householdId)
    return { cleared, kept }
  }, [householdId, fetchRows])

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
    status,
    notice,
    dismissNotice,
    dev: {
      grant: devGrant,
      completeDaily: devCompleteDaily,
      clearToday: devClearToday,
      clearPoints: devClearPoints,
      seedHistory: devSeedHistory,
      forget: devForget,
      refresh: () => fetchRows(householdId),
    },
  }
}
