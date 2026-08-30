import Icon from './Icon'
import Window from './Window'

const when = (at) =>
  new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * Redeemed rewards are coupons: bought and paid for, but still owed until
 * someone actually cashes them in. Used ones grey out rather than disappear,
 * so the season's history stays readable.
 *
 * Week prizes land here too, at zero cost - which is how a stake can be won
 * without a second economy to keep track of.
 */
export default function Redeemed({ redeemed, members, onUse }) {
  const nameFor = (id) => members.find((m) => m.id === id)?.name

  const active = redeemed.filter((r) => !r.usedAt)
  const used = redeemed.filter((r) => r.usedAt)
  const spent = redeemed.reduce((sum, r) => sum + r.cost, 0)

  const coupon = (item) => (
    <li
      key={item.receiptId}
      className={`coupon ${item.usedAt ? 'coupon--used' : ''}`}
      style={{ '--h': item.hue }}
    >
      <span className="coupon__art" aria-hidden="true">
        <Icon name={item.icon} size={22} strokeWidth="1.9" />
      </span>

      <div className="coupon__meta">
        <strong>{item.title}</strong>
        <span className="coupon__sub">
          {when(item.redeemedAt)}
          {nameFor(item.by) && ` · ${nameFor(item.by)}`}
          {item.usedAt && ` · used ${when(item.usedAt)}`}
        </span>
      </div>

      <span className={`coupon__cost ${item.cost === 0 ? 'coupon__cost--won' : ''}`}>
        {item.cost === 0 ? 'Won' : `-${item.cost.toLocaleString()}`}
      </span>

      <button
        type="button"
        className={item.usedAt ? 'chip coupon__btn' : 'btn coupon__btn'}
        onClick={() => onUse(item.receiptId, !item.usedAt)}
      >
        {item.usedAt ? (
          'Restore'
        ) : (
          <>
            <Icon name="check" size={14} strokeWidth="2.2" />
            Use it
          </>
        )}
      </button>
    </li>
  )

  return (
    <Window title="receipts">
      <header className="store__head">
        <div>
          <h2 className="store__title">Coupons</h2>
          <p className="store__sub">
            {redeemed.length === 0
              ? 'Nothing bought yet. Fill the cart once the bank is fat.'
              : `${active.length} still to cash in · ${used.length} used · ${spent.toLocaleString()} pts spent.`}
          </p>
        </div>
      </header>

      {redeemed.length === 0 ? (
        <p className="empty">
          <Icon name="coupon" size={18} strokeWidth="1.9" />
          Your coupons land here.
        </p>
      ) : (
        <>
          <section className="habits">
            <h3 className="habits__title label">Ready to use</h3>
            {active.length === 0 ? (
              <p className="empty">All cashed in. Go earn some more.</p>
            ) : (
              <ul className="coupons">{active.map(coupon)}</ul>
            )}
          </section>

          {used.length > 0 && (
            <section className="habits">
              <h3 className="habits__title label">Used</h3>
              <ul className="coupons">{used.map(coupon)}</ul>
            </section>
          )}
        </>
      )}
    </Window>
  )
}
