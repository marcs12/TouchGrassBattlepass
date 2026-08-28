import Icon from './Icon'

// Who put in what, and what's left to spend. Personal totals are lifetime
// contributions - they never go down when the shared bank is spent.
export default function Scoreboard({
  members,
  activeId,
  earned,
  today,
  balance,
}) {
  const total = members.reduce((sum, m) => sum + (earned[m.id] ?? 0), 0)
  const share = (id) =>
    total === 0 ? 0 : Math.round(((earned[id] ?? 0) / total) * 100)

  return (
    <section className="scoreboard" aria-label="Contributions">
      <div className="scoreboard__tiles">
        {members.map((m) => (
          <div
            key={m.id}
            className={`score ${m.id === activeId ? 'score--you' : ''}`}
          >
            <p className="label">
              {m.name}
              {m.id === activeId && ' · you'}
            </p>
            <p className="score__value">{(earned[m.id] ?? 0).toLocaleString()}</p>
            <p className="score__unit label">
              pts contributed
              {(today[m.id] ?? 0) > 0 && (
                <span className="score__today">
                  +{(today[m.id] ?? 0).toLocaleString()} today
                </span>
              )}
            </p>
          </div>
        ))}

        <div className="score score--bank">
          <p className="label">Shared bank</p>
          <p className="score__value">
            <Icon name="coin" size={16} strokeWidth="1.9" />
            {balance.toLocaleString()}
          </p>
          <p className="score__unit label">to spend</p>
        </div>
      </div>

      {total > 0 && (
        <div className="split">
          <div className="split__bar">
            {members.map((m) => (
              <span
                key={m.id}
                className="split__seg"
                style={{ width: `${share(m.id)}%` }}
                data-member={m.id}
              />
            ))}
          </div>
          <p className="split__legend label">
            {members.map((m, i) => (
              <span key={m.id} className="split__key" data-member={m.id}>
                <i aria-hidden="true" />
                {m.name} {share(m.id)}%{i === 0 ? ' · ' : ''}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  )
}
