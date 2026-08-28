import { useCallback, useEffect, useState } from 'react'
import Header from './components/Header'
import Storefront from './components/Storefront'
import Redeemed from './components/Redeemed'
import DailyGrind from './components/DailyGrind'
import SeasonPass from './components/SeasonPass'
import { ThemeProvider } from './theme/ThemeProvider'
import { DAILY_HABITS } from './data/habits'
import { dayKey } from './lib/day'
import { loadState, saveState } from './lib/storage'

// Seeded so the store is explorable before habits exist.
// Replace with shared/persisted state once the backend lands.
const STARTING_BALANCE = 2750

const freshState = () => ({
  balance: STARTING_BALANCE,
  redeemed: [],
  // `done` is today's checklist; `goalDates` is every day the full daily list
  // was cleared, which is what the streak is derived from.
  grind: { date: dayKey(), done: [], goalDates: [] },
  // Season XP counts points *earned*, so store spending never costs progress.
  season: { xp: 0, claimed: [] },
})

// Stored state can predate a field, so fill the gaps rather than throwing it out.
const normalize = (state) => {
  const base = freshState()
  return {
    ...base,
    ...state,
    grind: { ...base.grind, ...state.grind },
    season: { ...base.season, ...state.season },
  }
}

// A stored day that isn't today gets a clean checklist; the goal history stays.
const rollOver = (state, today = dayKey()) =>
  state.grind.date === today
    ? state
    : { ...state, grind: { ...state.grind, date: today, done: [] } }

export default function App() {
  const [state, setState] = useState(() =>
    rollOver(normalize(loadState() ?? freshState()))
  )
  const { balance, redeemed, grind, season } = state

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
          },
          ...prev.redeemed,
        ],
      }
    })
  }, [])

  const handleToggleHabit = useCallback((habit) => {
    setState((prev) => {
      const done = new Set(prev.grind.done)
      const undoing = done.has(habit.id)

      // Unchecking claws the points back, so the bank has to cover them.
      if (undoing && prev.balance < habit.points) return prev

      if (undoing) done.delete(habit.id)
      else done.add(habit.id)

      const goalDates = new Set(prev.grind.goalDates)
      if (DAILY_HABITS.every((h) => done.has(h.id))) goalDates.add(prev.grind.date)
      else goalDates.delete(prev.grind.date)

      const delta = undoing ? -habit.points : habit.points

      return {
        ...prev,
        balance: prev.balance + delta,
        grind: { ...prev.grind, done: [...done], goalDates: [...goalDates] },
        // XP tracks earnings, so it moves with the check - but an already
        // claimed tier stays claimed even if XP dips back under its threshold.
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

  const [tab, setTab] = useState('grind')

  return (
    <ThemeProvider>
      <div className="app">
        <Header
          balance={balance}
          tab={tab}
          onTab={setTab}
          redeemedCount={redeemed.length}
        />

        <main className="app__main">
          {tab === 'grind' && (
            <DailyGrind
              grind={grind}
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
          {tab === 'redeemed' && <Redeemed redeemed={redeemed} />}
        </main>
      </div>
    </ThemeProvider>
  )
}
