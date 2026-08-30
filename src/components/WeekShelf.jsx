import Icon from './Icon'
import { shiftDay } from '../lib/day'

const range = (start) => {
  const fmt = (day) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  return `${fmt(start)} – ${fmt(shiftDay(start, 6))}`
}

/**
 * Every Sunday you've had, oldest pushed to the back. A season of these is
 * the thing the app is actually for - the points are just how you get here.
 */
export default function WeekShelf({ weeks, members, onOpen }) {
  const settled = weeks.filter((w) => w.status === 'settled')
  if (settled.length === 0) return null

  return (
    <section className="shelf" aria-label="Past weeks">
      <h3 className="habits__title label">Sundays · newest first</h3>
      <ul className="shelf__list">
        {settled.map((week) => {
          const winner = members.find((m) => m.id === week.winner_member_id)
          const clear = week.score?.team?.clear

          return (
            <li key={week.start_day}>
              <button type="button" className="shelf__card" onClick={() => onOpen(week)}>
                <span className="shelf__art" aria-hidden="true">
                  <Icon name={winner ? 'trophy' : 'heart'} size={20} strokeWidth="1.9" />
                </span>
                <span className="shelf__meta">
                  <strong>{range(week.start_day)}</strong>
                  <span className="label">
                    {winner ? `${winner.name} took it` : 'Dead heat'}
                    {clear ? ' · team clear' : ''}
                  </span>
                </span>
                <span className="shelf__scores label">
                  {members.map((m, i) => (
                    <span key={m.id} style={{ color: `var(--series-${i + 1})` }}>
                      {Math.round((week.score?.members?.[m.id]?.score ?? 0) * 100)}%
                    </span>
                  ))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
