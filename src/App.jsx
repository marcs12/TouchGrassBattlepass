import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header'
import Storefront from './components/Storefront'
import Redeemed from './components/Redeemed'
import DailyGrind from './components/DailyGrind'
import SeasonPass from './components/SeasonPass'
import Setup from './components/Setup'
import { ThemeProvider } from './theme/ThemeProvider'
import { DAILY_HABITS } from './data/habits'
import { dayKey } from './lib/day'
import { loadState, saveState } from './lib/storage'

// Seeded so the store is explorable before habits exist.
// Replace with shared/persisted state once the backend lands.
const STARTING_BALANCE = 2750

const freshState = () => ({
  // Set during setup - two people share one board.
  members: null,
  activeId: null,
  balance: STARTING_BALANCE,
  // Lifetime points contributed per member. These are a record of who put the
  // work in, not a wallet: spending only ever comes out of the shared bank.
  earned: {},
  redeemed: [],
  // Each member keeps their own checklist and their own goal history, so both
  // can tick the same habit on the same day and both get paid.
  grind: { date: dayKey(), done: {}, goalDates: {} },
  // Season XP is the couple's combined earnings.
  season: { xp: 0, claimed: [] },
})

// Stored state can predate a field, so fill the gaps rather than throwing it out.
const normalize = (state) => {
  const base = freshState()
  return {
    ...base,
    ...state,
    earned: { ...base.earned, ...state.earned },
    grind: { ...base.grind, ...state.grind },
    season: { ...base.season, ...state.season },
  }
}

// A stored day that isn't today gets clean checklists; the goal history stays.
const rollOver = (state, today = dayKey()) =>
  state.grind.date === today
    ? state
    : { ...state, grind: { ...state.grind, date: today, done: {} } }

export default function App() {
  const [state, setState] = useState(() =>
    rollOver(normalize(loadState() ?? freshState()))
  )
  const [tab, setTab] = useState('grind')
  const { members, activeId, balance, earned, redeemed, grind, season } = state

  useEffect(() => {
    saveState(state)
  }, [state])

  // The app can sit open across midnight, so re-check the date on every return.
  useEffect(() => {
    const check = () => setState((prev) => rollOver(prev))
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const handleStart = useCallback((names) => {
    setState((prev) => {
      const roster = names.map((name, i) => ({ id: `p${i + 1}`, name }))
      const first = roster[0].id
      return {
        ...prev,
        members: roster,
        activeId: first,
        earned: Object.fromEntries(roster.map((m) => [m.id, 0])),
        grind: {
          ...prev.grind,
          // A v1 save carried one anonymous list; hand it to player one.
          done: { [first]: prev.grind.done.legacy ?? [] },
          goalDates: { [first]: prev.grind.goalDates.legacy ?? [] },
        },
      }
    })
  }, [])

  const handleSwitch = useCallback((id) => {
    setState((prev) => ({ ...prev, activeId: id }))
  }, [])

  const handleRedeem = useCallback((reward) => {
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

  const handleToggleHabit = useCallback((habit) => {
    setState((prev) => {
      const who = prev.activeId
      const done = new Set(prev.grind.done[who] ?? [])
      const undoing = done.has(habit.id)

      // Unchecking claws the points back out of the shared bank, so it has to
      // be able to cover them.
      if (undoing && prev.balance < habit.points) return prev

      if (undoing) done.delete(habit.id)
      else done.add(habit.id)

      const goalDates = new Set(prev.grind.goalDates[who] ?? [])
      if (DAILY_HABITS.every((h) => done.has(h.id))) goalDates.add(prev.grind.date)
      else goalDates.delete(prev.grind.date)

      const delta = undoing ? -habit.points : habit.points

      return {
        ...prev,
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
        // XP tracks the couple's earnings, so it moves with every check - but
        // an already claimed tier stays claimed even if XP dips back under it.
        season: { ...prev.season, xp: Math.max(0, prev.season.xp + delta) },
      }
    })
  }, [])

  const handleClaimTier = useCallback((tier) => {
    setState((prev) => {
      if (prev.season.xp < tier.xp) return prev
      if (prev.season.claimed.includes(tier.n)) return prev

      return {
        ...prev,
        balance:
          tier.type === 'bonus' ? prev.balance + tier.value : prev.balance,
        season: { ...prev.season, claimed: [...prev.season.claimed, tier.n] },
      }
    })
  }, [])

  if (!members) {
    return (
      <ThemeProvider>
        <div className="app">
          <main className="app__main app__main--setup">
            <Setup onStart={handleStart} />
          </main>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <div className="app">
        <Header
          balance={balance}
          tab={tab}
          onTab={setTab}
          redeemedCount={redeemed.length}
          members={members}
          activeId={activeId}
          earned={earned}
          onSwitch={handleSwitch}
        />

        <main className="app__main">
          {tab === 'grind' && (
            <DailyGrind
              grind={grind}
              members={members}
              activeId={activeId}
              earned={earned}
              balance={balance}
              onToggleHabit={handleToggleHabit}
            />
          )}
          {tab === 'season' && (
            <SeasonPass season={season} onClaimTier={handleClaimTier} />
          )}
          {tab === 'store' && (
            <Storefront
              balance={balance}
              redeemed={redeemed}
              onRedeem={handleRedeem}
            />
          )}
          {tab === 'redeemed' && (
            <Redeemed redeemed={redeemed} members={members} />
          )}
        </main>
      </div>
    </ThemeProvider>
  )
}
