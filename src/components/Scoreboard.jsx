import Icon from './Icon'

// Who put in what, and what's left to spend. Personal totals are lifetime
// contributions - they never go down when the shared bank is spent.
export default function Scoreboard({ members, activeId, earned, balance }) {
  return (
    <div className="scoreboard">
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
          <p className="score__unit label">pts earned</p>
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
  )
}
