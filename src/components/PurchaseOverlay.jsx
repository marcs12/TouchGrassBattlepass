import { useEffect } from 'react'
import Icon from './Icon'

// The payoff moment: a receipt prints, gets stamped, and the coupons are yours.
export default function PurchaseOverlay({ purchase, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2600)
    return () => clearTimeout(timer)
  }, [onDone])

  const count = purchase.items.reduce((sum, i) => sum + i.qty, 0)

  return (
    <div className="paid" role="status" onClick={onDone}>
      <div className="paid__receipt">
        <p className="label paid__eyebrow">Receipt</p>

        <ul className="paid__list">
          {purchase.items.map((item) => (
            <li key={item.id}>
              <span className="paid__art" style={{ '--h': item.hue }} aria-hidden="true">
                <Icon name={item.icon} size={18} strokeWidth="1.9" />
              </span>
              <span className="paid__name">
                {item.title}
                {item.qty > 1 && ` ×${item.qty}`}
              </span>
              <span className="paid__cost">-{(item.cost * item.qty).toLocaleString()}</span>
            </li>
          ))}
        </ul>

        <p className="paid__total">
          <span className="label">Paid</span>
          <strong>{purchase.total.toLocaleString()}</strong>
          <span className="card__unit">pts</span>
        </p>

        <span className="paid__stamp" aria-hidden="true">
          <Icon name="check" size={26} strokeWidth="2.6" />
          Redeemed
        </span>

        <p className="paid__hint">
          {count} coupon{count > 1 ? 's' : ''} waiting in Receipts. Tap to close.
        </p>
      </div>
    </div>
  )
}
