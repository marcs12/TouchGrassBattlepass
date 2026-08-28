import { useState } from 'react'
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

export default function App() {
  const game = useGame()
  const [tab, setTab] = useState('grind')

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
          redeemedCount={game.redeemed.length}
          members={game.members}
          activeId={game.activeId}
          earned={game.earned}
          code={game.code}
          onSwitch={game.switchMember}
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
                onToggleHabit={game.toggleHabit}
              />
            )}
            {tab === 'season' && (
              <SeasonPass season={game.season} onClaimTier={game.claimTier} />
            )}
            {tab === 'store' && (
              <Storefront
                balance={game.balance}
                redeemed={game.redeemed}
                onRedeem={game.redeem}
              />
            )}
            {tab === 'redeemed' && (
              <Redeemed redeemed={game.redeemed} members={game.members} />
            )}
          </div>
        </main>
      </div>
    </ThemeProvider>
  )
}
