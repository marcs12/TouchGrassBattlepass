import { useMemo, useState } from 'react'
import { REWARDS, TIERS } from '../data/rewards'
import RewardCard from './RewardCard'
import Window from './Window'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'affordable', label: 'Can afford' },
  { id: 'low', label: TIERS.low.label },
  { id: 'medium', label: TIERS.medium.label },
  { id: 'high', label: TIERS.high.label },
]

const SORTS = {
  cheapest: (a, b) => a.cost - b.cost,
  priciest: (a, b) => b.cost - a.cost,
}

export default function Storefront({ balance, redeemed, onRedeem }) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('cheapest')

  const affordableCount = useMemo(
    () => REWARDS.filter((r) => r.cost <= balance).length,
    [balance]
  )

  // Cheapest thing still out of reach - the thing worth grinding for.
  const nextUp = useMemo(() => {
    const locked = REWARDS.filter((r) => r.cost > balance).sort(SORTS.cheapest)
    return locked[0] ?? null
  }, [balance])

  const visible = useMemo(() => {
    const matches =
      filter === 'all'
        ? REWARDS
        : filter === 'affordable'
          ? REWARDS.filter((r) => r.cost <= balance)
          : REWARDS.filter((r) => r.tier === filter)
    return [...matches].sort(SORTS[sort])
  }, [filter, sort, balance])

  const ownedCount = (id) => redeemed.filter((r) => r.id === id).length
  const nextProgress = nextUp
    ? Math.min(100, Math.round((balance / nextUp.cost) * 100))
    : 100

  return (
    <Window title="reward-store">
      <header className="store__head">
        <div>
          <h2 className="store__title">Reward Store</h2>
          <p className="store__sub">
            Spend the shared bank. Everything here is agreed on in advance.
          </p>
        </div>

        <div className="nextup">
          {nextUp ? (
            <>
              <p className="label">Next unlock</p>
              <p className="nextup__title">{nextUp.title}</p>
              <div
                className="meter"
                role="progressbar"
                aria-valuenow={nextProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Progress toward ${nextUp.title}`}
              >
                <span style={{ width: `${nextProgress}%` }} />
              </div>
              <p className="nextup__hint">
                <strong>{(nextUp.cost - balance).toLocaleString()}</strong> pts to go
              </p>
            </>
          ) : (
            <>
              <p className="label">Bank status</p>
              <p className="nextup__title">Everything unlocked</p>
              <p className="nextup__hint">Whole catalog is in reach.</p>
            </>
          )}
        </div>
      </header>

      <div className="controls">
        <div className="filters" role="group" aria-label="Filter rewards">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              className={`chip ${filter === f.id ? 'chip--on' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === 'affordable' && (
                <span className="chip__count">{affordableCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="sort">
          <label className="label" htmlFor="sort">
            Sort
          </label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="cheapest">Cheapest first</option>
            <option value="priciest">Priciest first</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nothing in reach yet. Go fold some laundry.</p>
      ) : (
        <div className="grid">
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
    </Window>
  )
}
