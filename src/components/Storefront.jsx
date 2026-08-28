import { useMemo, useState } from 'react'
import { REWARDS, TIERS } from '../data/rewards'
import RewardCard from './RewardCard'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'low', label: TIERS.low.label },
  { id: 'medium', label: TIERS.medium.label },
  { id: 'high', label: TIERS.high.label },
  { id: 'affordable', label: 'Can Afford' },
]

export default function Storefront({ balance, redeemed, onRedeem }) {
  const [filter, setFilter] = useState('all')

  const visible = useMemo(() => {
    if (filter === 'all') return REWARDS
    if (filter === 'affordable') return REWARDS.filter((r) => r.cost <= balance)
    return REWARDS.filter((r) => r.tier === filter)
  }, [filter, balance])

  const ownedCount = (id) => redeemed.filter((r) => r.id === id).length

  return (
    <section className="store">
      <header className="store__head">
        <div>
          <h2 className="store__title">Reward Store</h2>
          <p className="store__sub">
            Spend the shared bank. Everything here is agreed on in advance.
          </p>
        </div>

        <div className="store__filters" role="tablist" aria-label="Filter rewards">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`chip ${filter === f.id ? 'chip--on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="store__empty">
          Nothing in reach yet. Go fold some laundry.
        </p>
      ) : (
        <div className="store__grid">
          {visible.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              balance={balance}
              owned={ownedCount(reward.id)}
              onRedeem={onRedeem}
            />
          ))}
        </div>
      )}
    </section>
  )
}
