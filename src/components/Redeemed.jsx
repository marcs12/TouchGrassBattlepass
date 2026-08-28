export default function Redeemed({ redeemed }) {
  if (redeemed.length === 0) {
    return (
      <section className="panel">
        <h2 className="store__title">Redeemed</h2>
        <p className="store__empty">
          Nothing bought yet. Hit the Store once the bank is fat.
        </p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2 className="store__title">Redeemed</h2>
      <p className="store__sub">Bought and paid for. Time to go do them.</p>

      <ul className="redeemed__list">
        {redeemed.map((item) => (
          <li key={item.receiptId} className="redeemed__item">
            <span className="redeemed__art" style={{ background: item.art }}>
              {item.emoji}
            </span>
            <div className="redeemed__meta">
              <strong>{item.title}</strong>
              <span className="redeemed__date">
                {new Date(item.redeemedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <span className="redeemed__cost">-{item.cost.toLocaleString()} pts</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
