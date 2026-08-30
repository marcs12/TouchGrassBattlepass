import { useState } from 'react'
import Icon from './Icon'
import ItemForm from './ItemForm'

// Score is a share of your own normal week, so it can and should go past 100%.
const pct = (score) => Math.round((score ?? 0) * 100)

const range = (start, end) => {
  const fmt = (day) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

/**
 * The live week, on top of the daily list.
 *
 * Each player is measured against the median of their own last four weeks
 * rather than against each other: a brutal week at work shouldn't hand the
 * other one an automatic win, and a personal best should beat a coast.
 */
export default function WeekBanner({ week, members, activeId, stakes, onOpenWeek, onAddStake }) {
  const [picking, setPicking] = useState(null)
  const [adding, setAdding] = useState(false)
  const row = week.row
  const active = members.find((m) => m.id === activeId)
  const stakeFor = (slot) => (slot === 1 ? row?.stake_1 : slot === 2 ? row?.stake_2 : row?.stake_team)

  const teamPct = week.team.target
    ? Math.min(100, Math.round((week.team.points / week.team.target) * 100))
    : 0

  const choose = (stake) => {
    onOpenWeek(picking, stake.title)
    setPicking(null)
    setAdding(false)
  }

  return (
    <section className="week" aria-label="This week">
      <header className="week__head">
        <div>
          <p className="label">Week of {range(week.start, week.end)}</p>
          <p className="week__title">
            {week.daysLeft > 0 ? (
              <>
                <strong>{week.daysLeft}</strong> day{week.daysLeft === 1 ? '' : 's'} left
              </>
            ) : (
              'Scoring tonight'
            )}
          </p>
        </div>
        <span className="week__badge" aria-hidden="true">
          <Icon name="flag" size={18} strokeWidth="1.9" />
        </span>
      </header>

      <ul className="week__players">
        {members.map((member, index) => {
          const score = week.members[member.id]
          const stake = stakeFor(member.slot)
          const mine = member.id === activeId

          return (
            <li key={member.id} className="week__player">
              <p className="week__name">
                <strong>{member.name}</strong>
                <span className="week__pct">{pct(score?.score)}%</span>
              </p>

              <div
                className="meter"
                role="progressbar"
                aria-valuenow={pct(score?.score)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${member.name}'s week against their usual`}
              >
                <span
                  style={{
                    width: `${Math.min(100, pct(score?.score))}%`,
                    background: `var(--series-${index + 1})`,
                  }}
                />
              </div>

              <p className="week__stake label">
                {stake ? (
                  <>
                    <Icon name="trophy" size={13} strokeWidth="1.9" />
                    {stake}
                  </>
                ) : (
                  <span className="week__stake--empty">nothing up yet</span>
                )}
                {mine && row?.status !== 'settled' && (
                  <button
                    type="button"
                    className="week__pick"
                    onClick={() => {
                      setAdding(false)
                      setPicking(picking === member.slot ? null : member.slot)
                    }}
                  >
                    {stake ? 'change' : 'put something up'}
                  </button>
                )}
              </p>
            </li>
          )
        })}
      </ul>

      <p className="week__team label">
        <span>
          Team clear <strong>{teamPct}%</strong>
          {row?.stake_team ? ` · ${row.stake_team}` : ''}
        </span>
        {row?.status !== 'settled' && (
          <button
            type="button"
            className="week__pick"
            onClick={() => {
              setAdding(false)
              setPicking(picking === 0 ? null : 0)
            }}
          >
            {row?.stake_team ? 'change' : 'set the shared prize'}
          </button>
        )}
      </p>

      {picking !== null && (
        <div className="week__picker">
          <p className="label">
            {picking === 0
              ? 'Both of you get this if you clear the week together'
              : `What ${active?.name ?? 'you'} is putting up`}
          </p>
          <ul className="week__stakes">
            {stakes.map((stake) => (
              <li key={stake.id}>
                <button type="button" className="chip" onClick={() => choose(stake)}>
                  <Icon name={stake.icon} size={14} strokeWidth="1.9" />
                  {stake.title}
                </button>
              </li>
            ))}
            {onAddStake && (
              <li>
                <button
                  type="button"
                  className={`chip ${adding ? 'chip--on' : ''}`}
                  aria-pressed={adding}
                  onClick={() => setAdding((a) => !a)}
                >
                  <Icon name={adding ? 'check' : 'plus'} size={14} strokeWidth="2.2" />
                  {adding ? 'Done' : 'New'}
                </button>
              </li>
            )}
          </ul>

          {adding && (
            <ItemForm
              kind="stake"
              onAdd={(payload) => {
                onAddStake(payload)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          )}

          <p className="week__note label">
            Whoever wins claims what the other one put up. Nobody owes a
            forfeit — someone just gets spoiled.
          </p>
        </div>
      )}
    </section>
  )
}
