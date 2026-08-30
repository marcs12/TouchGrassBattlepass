import { useEffect, useRef, useState } from 'react'
import Header from './components/Header'
import Storefront from './components/Storefront'
import Redeemed from './components/Redeemed'
import DailyGrind from './components/DailyGrind'
import SeasonPass from './components/SeasonPass'
import Setup from './components/Setup'
import PickPlayer from './components/PickPlayer'
import Window from './components/Window'
import Icon from './components/Icon'
import { ThemeProvider } from './theme/ThemeProvider'
import { useGame } from './game/useGame'
import { useDevMode } from './game/useDevMode'
import DevPanel from './components/DevPanel'
import PurchaseOverlay from './components/PurchaseOverlay'
import Toast from './components/Toast'
import Celebrate from './components/Celebrate'
import Recap from './components/Recap'
import { streakFrom } from './lib/day'
import { successFeedback, tapFeedback } from './lib/haptics'

// Streak lengths worth a moment, highest first.
const MILESTONES = [30, 14, 7, 3]

export default function App() {
  const game = useGame()
  const dev = useDevMode()
  const [tab, setTab] = useState('grind')
  // The cart is a shopping session on this device, not shared state.
  const [cart, setCart] = useState([])
  const [checkingOut, setCheckingOut] = useState(false)
  const [purchase, setPurchase] = useState(null)
  const [party, setParty] = useState(null)
  // Held by week, not as a snapshot of it: opening one marks it opened, and
  // the card only flips if the component is reading the row that just changed.
  const [recapWeek, setRecapWeek] = useState(null)
  const seenMilestones = useRef(null)
  // Closing a recap has to stick even before `opened_by` comes back from the
  // server, or the effect below would reopen it on the next render. Keyed by
  // player as well as week: on a shared device, switching profiles is how the
  // other one gets their turn at it.
  const shownRecaps = useRef(new Set())

  // Streaks are the long game, so the round numbers get a moment. Recorded
  // per member so a milestone fires once, not on every render.
  const streak = game.activeId
    ? streakFrom(game.grind?.goalDates?.[game.activeId] ?? [], game.grind?.date)
    : 0

  useEffect(() => {
    if (!game.activeId) return

    const key = `tgbp.milestones.${game.activeId}`
    if (seenMilestones.current === null) {
      let stored = null
      try {
        stored = JSON.parse(localStorage.getItem(key) ?? 'null')
      } catch {
        stored = null
      }

      // First time on this device, treat everything already earned as seen:
      // a streak that was six days old before this shipped shouldn't throw a
      // party for day three. Only crossings from here on are celebrated.
      seenMilestones.current = new Set(
        stored ?? MILESTONES.filter((n) => streak >= n)
      )
      if (!stored) {
        try {
          localStorage.setItem(key, JSON.stringify([...seenMilestones.current]))
        } catch {
          /* private mode - milestones may re-fire, which is harmless */
        }
        return
      }
    }

    const milestone = MILESTONES.find((n) => streak >= n)
    if (!milestone || seenMilestones.current.has(milestone)) return

    seenMilestones.current.add(milestone)
    try {
      localStorage.setItem(key, JSON.stringify([...seenMilestones.current]))
    } catch {
      /* private mode - the milestone may fire again, which is harmless */
    }

    successFeedback()
    setParty({
      id: `streak-${milestone}`,
      icon: 'flame',
      eyebrow: 'Streak',
      title: `${milestone} days straight`,
      note: 'Whole daily list, every one of those days.',
    })
  }, [streak, game.activeId])

  // Sunday Night opens itself: the first launch after a week is scored puts
  // the recap in front of you, once, and after that it lives on the shelf.
  useEffect(() => {
    if (!game.activeId || recapWeek) return

    const unseen = (game.weeks ?? []).find(
      (week) =>
        week.status === 'settled' &&
        !(week.opened_by ?? []).includes(game.activeId) &&
        !shownRecaps.current.has(`${game.activeId}|${week.start_day}`)
    )
    if (unseen) setRecapWeek(unseen.start_day)
  }, [game.weeks, game.activeId, recapWeek])

  const recap = (game.weeks ?? []).find((w) => w.start_day === recapWeek) ?? null

  const checkout = async () => {
    const items = cart
      .map((line) => ({ ...game.rewards.find((r) => r.id === line.id), qty: line.qty }))
      .filter((item) => item.id)
    if (items.length === 0) return

    setCheckingOut(true)
    try {
      // One redemption per unit, so each lands as its own coupon.
      for (const item of items) {
        for (let n = 0; n < item.qty; n += 1) {
          await game.redeem(item)
        }
      }
      successFeedback()
      setCart([])
      setPurchase({
        items,
        total: items.reduce((sum, i) => sum + i.cost * i.qty, 0),
      })
    } finally {
      setCheckingOut(false)
    }
  }

  const shell = (children) => (
    <ThemeProvider>
      <div className="app">
        <main className="app__main app__main--setup">{children}</main>
      </div>
    </ThemeProvider>
  )

  if (!game.ready) {
    return shell(
      <Window title="connecting">
        <p className="empty">Finding your board…</p>
      </Window>
    )
  }

  // No board yet: start one, or join the other phone's with its code.
  if (!game.members) {
    return shell(
      <Setup
        mode={game.mode}
        error={game.error}
        onStart={game.start}
        onJoin={game.join}
      />
    )
  }

  // Joined, but this device hasn't said which player it is.
  if (!game.activeId) {
    return shell(<PickPlayer members={game.members} onPick={game.pickMember} />)
  }

  return (
    <ThemeProvider>
      <div className="app">
        <Header
          balance={game.balance}
          tab={tab}
          onTab={setTab}
          redeemedCount={game.redeemed.filter((r) => !r.usedAt).length}
          members={game.members}
          activeId={game.activeId}
          earned={game.earned}
          code={game.code}
          onSwitch={game.switchMember}
          onLogoTap={dev.registerTap}
          status={game.status}
          pending={game.pending}
        />

        <main className="app__main">
          {game.error && (
            <p className="banner banner--warn">
              <Icon name="lock" size={16} strokeWidth="1.9" />
              {game.error}
            </p>
          )}

          <div className="view" key={tab}>
            {tab === 'grind' && (
              <DailyGrind
                grind={game.grind}
                members={game.members}
                activeId={game.activeId}
                earned={game.earned}
                balance={game.balance}
                log={game.log}
                dailyHabits={game.dailyHabits}
                bonusHabits={game.bonusHabits}
                dailyGoal={game.dailyGoal}
                week={game.week}
                stakes={game.stakes}
                proofUrl={game.proofUrl}
                onToggleHabit={(habit) => {
                  tapFeedback()
                  game.toggleHabit(habit)
                }}
                onOpenWeek={game.openWeek}
                onAddStake={(payload) => game.addCatalogItem('stake', payload)}
                onAttachProof={game.attachProof}
                onClearProof={game.clearProof}
                onCosign={(checkId) => {
                  tapFeedback()
                  game.cosign(checkId)
                }}
                onUncosign={game.uncosign}
                onAddHabit={(payload) => game.addCatalogItem('habit', payload)}
                onEditHabit={(id, payload) =>
                  game.editCatalogItem('habit', id, payload)
                }
                onRemoveHabit={(id, custom) =>
                  game.removeCatalogItem('habit', id, custom)
                }
              />
            )}
            {tab === 'season' && (
              <SeasonPass
                season={game.season}
                history={game.history}
                members={game.members}
                grind={game.grind}
                weeks={game.weeks ?? []}
                onOpenRecap={(week) => setRecapWeek(week.start_day)}
                onClaimTier={(tier) => {
                  successFeedback()
                  game.claimTier(tier)
                  setParty({
                    id: `tier-${tier.n}`,
                    icon: tier.icon,
                    eyebrow: `Tier ${tier.n} claimed`,
                    title: tier.title,
                    note: tier.note,
                  })
                }}
              />
            )}
            {tab === 'store' && (
              <Storefront
                balance={game.balance}
                redeemed={game.redeemed}
                rewards={game.rewards}
                cart={cart}
                onCart={setCart}
                onCheckout={checkout}
                checkingOut={checkingOut}
                offline={game.status === 'offline'}
                onAddReward={(payload) => game.addCatalogItem('reward', payload)}
                onEditReward={(id, payload) =>
                  game.editCatalogItem('reward', id, payload)
                }
                onRemoveReward={(id, custom) =>
                  game.removeCatalogItem('reward', id, custom)
                }
              />
            )}
            {tab === 'redeemed' && (
              <Redeemed
                redeemed={game.redeemed}
                members={game.members}
                onUse={game.setCouponUsed}
              />
            )}
          </div>
        </main>

        {purchase && (
          <PurchaseOverlay purchase={purchase} onDone={() => setPurchase(null)} />
        )}

        {party && <Celebrate celebration={party} onDone={() => setParty(null)} />}

        {recap && (
          <Recap
            week={recap}
            members={game.members}
            activeId={game.activeId}
            history={game.history}
            goalDates={game.grind?.goalDates}
            proofs={game.proofs ?? []}
            stamps={game.stamps ?? []}
            proofUrl={game.proofUrl}
            onOpened={game.markRecapOpened}
            onClose={() => {
              shownRecaps.current.add(`${game.activeId}|${recap.start_day}`)
              setRecapWeek(null)
            }}
          />
        )}

        {game.notice && (
          <Toast notice={game.notice} onDone={game.dismissNotice} />
        )}

        {dev.on && <DevPanel game={game} onClose={dev.disable} />}
      </div>
    </ThemeProvider>
  )
}
