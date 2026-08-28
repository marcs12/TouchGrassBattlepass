import Icon from './Icon'
import Window from './Window'

export default function Redeemed({ redeemed, members }) {
  const nameFor = (id) => members.find((m) => m.id === id)?.name
  const spent = redeemed.reduce((sum, r) => sum + r.cost, 0)

  return (
    <Window title="receipts">
      <header className="store__head">
        <div>
          <h2 className="store__title">Redeemed</h2>
          <p className="store__sub">
            {redeemed.length === 0
              ? 'Nothing bought yet. Hit the Store once the bank is fat.'
              : `${redeemed.length} redeemed · ${spent.toLocaleString()} pts spent. Time to go do them.`}
          </p>
        </div>
      </header>

      {redeemed.length === 0 ? (
        <p className="empty">Your receipts land here.</p>
      ) : (
        <ul className="receipts">
          {redeemed.map((item) => (
            <li key={item.receiptId} className="receipt" style={{ '--h': item.hue }}>
              <span className="receipt__art">
                <Icon name={item.icon} size={22} strokeWidth="1.9" />
              </span>
              <div className="receipt__meta">
                <strong>{item.title}</strong>
                <span className="receipt__date">
                  {new Date(item.redeemedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {nameFor(item.by) && ` · ${nameFor(item.by)}`}
                </span>
              </div>
              <span className="receipt__cost">-{item.cost.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </Window>
  )
}
