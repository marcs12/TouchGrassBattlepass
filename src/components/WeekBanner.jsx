import { useState } from 'react'
import { HANDICAP_MAX, HANDICAP_MIN, HANDICAP_STEP, handicapOf } from '../data/week'
import Icon from './Icon'
import ItemForm from './ItemForm'

// Share of a good week. It can and should go past 100% - the bar is capped,
// the number is not.
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
 * It is a straight race: whoever banks more points over the seven days takes
 * the week. The bar is progress toward a good week - five full daily lists
 * plus the weeklies - and decides nothing; the points do.
 */
const round2 = (n) => Math.round(n * 100) / 100

export default function WeekBanner({
  week,
  members,
  activeId,
  stakes,
  onOpenWeek,
  onAddStake,
  onHandicap,
}) {
  const [picking, setPicking] = useState(null)
  const [adding, setAdding] = useState(false)
  const row = week.row
  const active = members.find((m) => m.id === activeId)
  const stakeFor = (slot) => (slot === 1 ? row?.stake_1 : slot === 2 ? row?.stake_2 : row?.stake_team)

  const teamPct = week.team.target
    ? Math.min(100, Math.round((week.team.points / week.team.target) * 100))
    : 0

  // `winner` on a live week is whoever is ahead right now, by the same rule
  // that settles it on Sunday.
  const leader = members.find((m) => m.id === week.winner) ?? null
  const played = week.team.points > 0
  const behind = leader && leader.id !== activeId

  // The week is worth saying something about when it is nearly over and still
  // in play. Friday and Saturday, in other words - the days it actually gets
  // won on.
  const closing = week.daysLeft > 0 && week.daysLeft <= 2 && played
  const nudge = !closing
    ? null
    : !leader
      ? `Dead level with ${week.daysLeft} day${week.daysLeft === 1 ? '' : 's'} left.`
      : behind
        ? `You're ${week.lead.toLocaleString()} behind with ${week.daysLeft} day${
            week.daysLeft === 1 ? '' : 's'
          } left.`
        : week.lead < week.target * 0.1
          ? `Only ${week.lead.toLocaleString()} ahead. Don't coast.`
          : null

  const bump = (member, by) => {
    const next = round2(
      Math.min(HANDICAP_MAX, Math.max(HANDICAP_MIN, handicapOf(member) + by))
    )
    if (next !== handicapOf(member)) onHandicap?.(member.id, next)
  }

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
          <p className="week__lead label">
            {!played
              ? 'Nobody has banked anything yet'
              : leader
                ? `${leader.name} leads by ${week.lead.toLocaleString()} pts`
                : 'Level — too close to call'}
          </p>
        </div>
        <span className="week__badge" aria-hidden="true">
          <Icon name="flag" size={18} strokeWidth="1.9" />
        </span>
      </header>

      {nudge && (
        <p className="week__nudge">
          <Icon name="flame" size={15} strokeWidth="2" />
          {nudge}
        </p>
      )}

      <ul className="week__players">
        {members.map((member, index) => {
          const score = week.members[member.id]
          const stake = stakeFor(member.slot)
          const mine = member.id === activeId

          return (
            <li key={member.id} className="week__player">
              <p className="week__name">
                <strong>
                  {member.name}
                  {member.id === week.winner && (
                    <Icon name="trophy" size={13} strokeWidth="2" />
                  )}
                </strong>
                <span className="week__pct">
                  {(week.handicapped
                    ? (score?.adjusted ?? 0)
                    : (score?.points ?? 0)
                  ).toLocaleString()}
                  <span className="week__unit"> pts</span>
                </span>
              </p>

              {week.handicapped && (
                <p className="week__raw label">
                  {(score?.points ?? 0).toLocaleString()} banked × {handicapOf(member)}
                </p>
              )}

              <div
                className="meter"
                role="progressbar"
                aria-valuenow={pct(score?.score)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${member.name} has banked ${score?.points ?? 0} points, ${pct(
                  score?.score
                )}% of a good week`}
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

              {/* Both of you can move either handicap. It is a number you agree
                  on out loud; the app is not the referee. */}
              {onHandicap && row?.status !== 'settled' && (
                <div className="week__handicap">
                  <span className="label">handicap</span>
                  <span
                    className="stepper"
                    role="group"
                    aria-label={`${member.name}'s handicap`}
                  >
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Lower ${member.name}'s handicap`}
                      disabled={handicapOf(member) <= HANDICAP_MIN}
                      onClick={() => bump(member, -HANDICAP_STEP)}
                    >
                      <Icon name="minus" size={14} strokeWidth="2.6" />
                    </button>
                    <output className="stepper__value">
                      ×{handicapOf(member).toFixed(2)}
                    </output>
                    <button
                      type="button"
                      className="stepper__btn"
                      aria-label={`Raise ${member.name}'s handicap`}
                      disabled={handicapOf(member) >= HANDICAP_MAX}
                      onClick={() => bump(member, HANDICAP_STEP)}
                    >
                      <Icon name="plus" size={14} strokeWidth="2.6" />
                    </button>
                  </span>
                </div>
              )}
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
            Most points on Saturday night takes the week and claims what the
            other one put up. Nobody owes a forfeit — someone just gets spoiled.
          </p>
        </div>
      )}
    </section>
  )
}
