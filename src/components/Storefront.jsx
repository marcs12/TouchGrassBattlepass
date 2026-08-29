import { useMemo, useState } from 'react'
import { TIERS } from '../data/rewards'
import RewardCard from './RewardCard'
import Cart from './Cart'
import ItemForm from './ItemForm'
import Icon from './Icon'
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

export default function Storefront({
  balance,
  redeemed,
  rewards,
  cart,
  onCart,
  onCheckout,
  checkingOut,
  onAddReward,
  onEditReward,
  onRemoveReward,
}) {
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('cheapest')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)

  const affordableCount = useMemo(
    () => rewards.filter((r) => r.cost <= balance).length,
    [rewards, balance]
  )

  // Cheapest thing still out of reach - the thing worth grinding for.
  const nextUp = useMemo(() => {
    const locked = rewards.filter((r) => r.cost > balance).sort(SORTS.cheapest)
    return locked[0] ?? null
  }, [rewards, balance])

  const visible = useMemo(() => {
    const matches =
      filter === 'all'
        ? rewards
        : filter === 'affordable'
          ? rewards.filter((r) => r.cost <= balance)
          : rewards.filter((r) => r.tier === filter)
    return [...matches].sort(SORTS[sort])
  }, [rewards, filter, sort, balance])

  const ownedCount = (id) => redeemed.filter((r) => r.id === id).length
  const inCart = (id) => cart.find((line) => line.id === id)?.qty ?? 0
  const nextProgress = nextUp
    ? Math.min(100, Math.round((balance / nextUp.cost) * 100))
    : 100

  const addToCart = (reward) => {
    const existing = cart.find((line) => line.id === reward.id)
    onCart(
      existing
        ? cart.map((l) => (l.id === reward.id ? { ...l, qty: l.qty + 1 } : l))
        : [...cart, { id: reward.id, qty: 1 }]
    )
  }

  return (
    <Window title="reward-store">
      <header className="store__head">
        <div>
          <h2 className="store__title">Reward Store</h2>
          <p className="store__sub">
            Fill the cart, then check out. Everything here is agreed on in
            advance — no renegotiating at the till.
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
                {balance === 0 && redeemed.length === 0 ? (
                  <>
                    Your first check-off starts it off —{' '}
                    <strong>{nextUp.cost.toLocaleString()}</strong> pts opens this
                  </>
                ) : (
                  <>
                    <strong>{(nextUp.cost - balance).toLocaleString()}</strong> pts to go
                  </>
                )}
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
          <button
            type="button"
            className={`chip ${editing ? 'chip--on' : ''}`}
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
          >
            <Icon name={editing ? 'check' : 'plus'} size={14} strokeWidth="2.2" />
            {editing ? 'Done' : 'Add'}
          </button>
        </div>
      </div>

      {draft ? (
        <ItemForm
          // Keyed so switching between adding and editing remounts the form
          // rather than reusing the previous draft's state.
          key={`edit-${draft.id}`}
          kind="reward"
          editing={draft}
          onAdd={(payload) => {
            onEditReward(draft.id, payload)
            setDraft(null)
          }}
          onCancel={() => setDraft(null)}
        />
      ) : (
        editing && (
          <ItemForm
            key="add"
            kind="reward"
            onAdd={onAddReward}
            onCancel={() => setEditing(false)}
          />
        )
      )}

      <Cart
        lines={cart}
        rewards={rewards}
        balance={balance}
        onChange={onCart}
        onCheckout={onCheckout}
        busy={checkingOut}
      />

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
              inCart={inCart(reward.id)}
              editing={editing}
              onAdd={addToCart}
              onEdit={setDraft}
              onRemove={onRemoveReward}
            />
          ))}
        </div>
      )}
    </Window>
  )
}
