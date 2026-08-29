import { useMemo, useState } from 'react'
import { streakFrom } from '../lib/day'

const RANGES = [
  { id: 'week', label: 'Week', days: 7 },
  { id: 'month', label: 'Month', days: 30 },
]

const dayLabel = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
  })

const initial = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })

/**
 * Points per day, stacked by player.
 *
 * Series colours are their own tokens rather than the app's pastels: as a
 * categorical pair those failed separation checks (too light, too close).
 * Identity is never colour alone - there's a legend, hover detail and a table.
 */
export default function Progress({ history, members, goalDates }) {
  const [rangeId, setRangeId] = useState('week')
  const [hover, setHover] = useState(null)
  const range = RANGES.find((r) => r.id === rangeId)

  const days = useMemo(() => history.slice(-range.days), [history, range.days])

  const totals = days.map((d) =>
    members.reduce((sum, m) => sum + (d.totals[m.id] ?? 0), 0)
  )
  const peak = Math.max(1, ...totals)
  const sum = totals.reduce((a, b) => a + b, 0)
  const active = totals.filter((t) => t > 0).length
  const best = days[totals.indexOf(Math.max(...totals))]

  const perMember = members.map((m) => ({
    ...m,
    total: days.reduce((acc, d) => acc + (d.totals[m.id] ?? 0), 0),
  }))

  const cleared = days.filter((d) =>
    members.some((m) => (goalDates?.[m.id] ?? []).includes(d.day))
  ).length

  const shown = hover ?? (sum > 0 ? { ...best, total: Math.max(...totals) } : null)

  return (
    <section className="progress" aria-label="Points per day">
      <header className="progress__head">
        <div>
          <p className="label">Progress</p>
          <p className="progress__total">
            <strong>{sum.toLocaleString()}</strong> pts over {range.days} days
          </p>
        </div>

        <div className="filters" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`chip ${r.id === rangeId ? 'chip--on' : ''}`}
              aria-pressed={r.id === rangeId}
              onClick={() => setRangeId(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <p className="progress__readout label">
        {shown
          ? `${dayLabel(shown.day)} · ${(shown.total ?? 0).toLocaleString()} pts`
          : 'Nothing banked yet'}
      </p>

      <div className={`chart chart--${rangeId}`}>
        {days.map((d, i) => {
          const total = totals[i]
          return (
            <button
              type="button"
              key={d.day}
              className={`chart__col ${hover?.day === d.day ? 'chart__col--on' : ''}`}
              style={{ '--h': `${(total / peak) * 100}%` }}
              onMouseEnter={() => setHover({ ...d, total })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ ...d, total })}
              onBlur={() => setHover(null)}
              title={`${dayLabel(d.day)}: ${total} pts`}
            >
              {total > 0 && (
              <span className="chart__stack">
                {members.map((m, index) => {
                  const value = d.totals[m.id] ?? 0
                  if (value === 0) return null
                  return (
                    <i
                      key={m.id}
                      style={{
                        height: `${(value / Math.max(total, 1)) * 100}%`,
                        background: `var(--series-${index + 1})`,
                      }}
                    />
                  )
                })}
              </span>
              )}
              {rangeId === 'week' && (
                <span className="chart__tick label">{initial(d.day)}</span>
              )}
            </button>
          )
        })}
      </div>

      {rangeId === 'month' && days.length > 0 && (
        <p className="chart__range label">
          <span>{dayLabel(days[0].day)}</span>
          <span>{dayLabel(days.at(-1).day)}</span>
        </p>
      )}

      <p className="chart__legend label">
        {perMember.map((m, index) => (
          <span key={m.id} className="chart__key">
            <i style={{ background: `var(--series-${index + 1})` }} aria-hidden="true" />
            {m.name} {m.total.toLocaleString()}
          </span>
        ))}
        <span className="chart__key chart__key--quiet">peak {peak.toLocaleString()}</span>
      </p>

      <div className="progress__stats">
        <p>
          <strong>{active}</strong>
          <span className="label">days with points</span>
        </p>
        <p>
          <strong>{cleared}</strong>
          <span className="label">full lists cleared</span>
        </p>
        <p>
          <strong>{Math.round(sum / range.days).toLocaleString()}</strong>
          <span className="label">avg per day</span>
        </p>
        <p>
          <strong>
            {members
              .map((m) => streakFrom(goalDates?.[m.id] ?? [], days.at(-1)?.day))
              .reduce((a, b) => Math.max(a, b), 0)}
          </strong>
          <span className="label">best streak now</span>
        </p>
      </div>

      <details className="progress__table">
        <summary className="label">See the numbers</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {members.map((m) => (
                <th scope="col" key={m.id}>
                  {m.name}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((d) => (
              <tr key={d.day}>
                <th scope="row">{dayLabel(d.day)}</th>
                {members.map((m) => (
                  <td key={m.id}>{(d.totals[m.id] ?? 0).toLocaleString()}</td>
                ))}
                <td>
                  {members
                    .reduce((acc, m) => acc + (d.totals[m.id] ?? 0), 0)
                    .toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
