import { useState } from 'react'
import Header from './components/Header'
import Storefront from './components/Storefront'
import Redeemed from './components/Redeemed'
import DailyGrind from './components/DailyGrind'

// Seeded so the store is explorable before habits exist.
// Replace with shared/persisted state once the backend lands.
const STARTING_BALANCE = 2750

export default function App() {
  const [tab, setTab] = useState('store')
  const [balance, setBalance] = useState(STARTING_BALANCE)
  const [redeemed, setRedeemed] = useState([])

  const handleRedeem = (reward) => {
    if (balance < reward.cost) return
    setBalance((b) => b - reward.cost)
    setRedeemed((list) => [
      {
        ...reward,
        receiptId: `${reward.id}-${Date.now()}`,
        redeemedAt: Date.now(),
      },
      ...list,
    ])
  }

  return (
    <div className="app">
      <Header
        balance={balance}
        tab={tab}
        onTab={setTab}
        redeemedCount={redeemed.length}
      />

      <main className="app__main">
        {tab === 'grind' && <DailyGrind />}
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
  )
}
