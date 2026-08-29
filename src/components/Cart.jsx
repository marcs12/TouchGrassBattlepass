import Icon from './Icon'

// The cart is deliberately device-local: it's a shopping session, not shared
// state. Nothing leaves it until checkout, which redeems each line for real.
export default function Cart({ lines, rewards, balance, onChange, onCheckout, busy }) {
  const items = lines
    .map((line) => ({ ...line, reward: rewards.find((r) => r.id === line.id) }))
    .filter((line) => line.reward)

  if (items.length === 0) return null

  const total = items.reduce((sum, l) => sum + l.reward.cost * l.qty, 0)
  const count = items.reduce((sum, l) => sum + l.qty, 0)
  const short = total - balance
  const affordable = short <= 0

  return (
    <section className="cart" aria-label="Cart">
      <header className="cart__head">
        <Icon name="cart" size={18} strokeWidth="1.9" />
        <strong>
          {count} item{count > 1 ? 's' : ''}
        </strong>
        <button type="button" className="cart__clear" onClick={() => onChange([])}>
          clear
        </button>
      </header>

      <ul className="cart__list">
        {items.map((line) => (
          <li key={line.id} className="cart__line">
            <span className="cart__art" style={{ '--h': line.reward.hue }} aria-hidden="true">
              <Icon name={line.reward.icon} size={18} strokeWidth="1.9" />
            </span>
            <span className="cart__name">{line.reward.title}</span>

            <span className="cart__qty">
              <button
                type="button"
                aria-label={`One fewer ${line.reward.title}`}
                onClick={() =>
                  onChange(
                    lines
                      .map((l) => (l.id === line.id ? { ...l, qty: l.qty - 1 } : l))
                      .filter((l) => l.qty > 0)
                  )
                }
              >
                −
              </button>
              <b>{line.qty}</b>
              <button
                type="button"
                aria-label={`One more ${line.reward.title}`}
                onClick={() =>
                  onChange(
                    lines.map((l) => (l.id === line.id ? { ...l, qty: l.qty + 1 } : l))
                  )
                }
              >
                +
              </button>
            </span>

            <span className="cart__cost">
              {(line.reward.cost * line.qty).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>

      <footer className="cart__foot">
        <p className="cart__total">
          <span className="label">Total</span>
          <strong>{total.toLocaleString()}</strong>
          <span className="card__unit">pts</span>
        </p>
        <button
          type="button"
          className="btn"
          disabled={!affordable || busy}
          onClick={onCheckout}
        >
          {busy ? 'Redeeming…' : affordable ? 'Checkout' : `Need ${short.toLocaleString()}`}
        </button>
      </footer>
    </section>
  )
}
