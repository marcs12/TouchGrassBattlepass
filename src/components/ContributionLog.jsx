const initial = (name) => name.trim().charAt(0).toUpperCase()

const when = (at) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

// Running record of who banked what. Undoing a habit shows up as a negative
// entry rather than quietly disappearing.
export default function ContributionLog({ log, members }) {
  const memberFor = (id) => members.find((m) => m.id === id)

  if (log.length === 0) {
    return (
      <section className="habits">
        <h3 className="habits__title label">Contributions</h3>
        <p className="empty">Nothing banked yet today.</p>
      </section>
    )
  }

  return (
    <section className="habits">
      <h3 className="habits__title label">Contributions · most recent first</h3>
      <ul className="log">
        {log.map((entry) => {
          const member = memberFor(entry.memberId)
          return (
            <li key={entry.id} className="log__row">
              <span className="profile__avatar" aria-hidden="true">
                {member ? initial(member.name) : '?'}
              </span>
              <span className="log__meta">
                <strong>{member?.name ?? 'Someone'}</strong>
                <span className="log__label">{entry.label}</span>
              </span>
              <span
                className={`log__points ${entry.points < 0 ? 'log__points--undo' : ''}`}
              >
                {entry.points > 0 ? '+' : ''}
                {entry.points.toLocaleString()}
              </span>
              <span className="log__time label">{when(entry.at)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
