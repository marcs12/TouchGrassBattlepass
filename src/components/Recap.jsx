import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import Progress from './Progress'
import ProofImage from './ProofImage'
import { shiftDay } from '../lib/day'
import { stakeRevealed } from '../data/week'

const REEL_MS = 2600

const dayRange = (start, end) => {
  const fmt = (day) =>
    new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

const dayLabel = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
  })

const quiet = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Sunday Night.
 *
 * The week's photos, its chart and its result, in one pass. The stake stays
 * face-down until both players have opened theirs - that shared beat is the
 * whole point of the ritual - and flips on its own after a day so nobody is
 * stranded when their partner is away.
 */
export default function Recap({
  week,
  members,
  activeId,
  history,
  goalDates,
  proofs,
  stamps,
  proofUrl,
  onOpened,
  onClose,
}) {
  const start = week.start_day
  const end = shiftDay(start, 6)
  const still = quiet()
  const [frame, setFrame] = useState(0)
  const [held, setHeld] = useState(false)

  const days = useMemo(
    () => history.filter((row) => row.day >= start && row.day <= end),
    [history, start, end]
  )
  const reel = useMemo(
    () => proofs.filter((p) => p.day >= start && p.day <= end),
    [proofs, start, end]
  )

  useEffect(() => {
    onOpened?.(start)
  }, [start, onOpened])

  useEffect(() => {
    if (still || held || reel.length < 2) return undefined
    const timer = setTimeout(() => setFrame((f) => (f + 1) % reel.length), REEL_MS)
    return () => clearTimeout(timer)
  }, [frame, held, reel.length, still])

  const score = week.score ?? {}
  const winner = members.find((m) => m.id === week.winner_member_id)
  const revealed = stakeRevealed(week, members.length)
  // You have opened yours by being here, so the only name worth showing is
  // the other one's.
  const waitingOn = members.find(
    (m) => m.id !== activeId && !(week.opened_by ?? []).includes(m.id)
  )

  const prize = winner
    ? winner.slot === 1
      ? week.stake_2
      : week.stake_1
    : null

  const totals = days.map((d) =>
    members.reduce((sum, m) => sum + (d.totals[m.id] ?? 0), 0)
  )
  const bestDay = days[totals.indexOf(Math.max(0, ...totals))]
  const cleared = days.filter((d) =>
    members.some((m) => (goalDates?.[m.id] ?? []).includes(d.day))
  ).length

  const stampsThisWeek = members.map((m) => ({
    ...m,
    given: stamps.filter((s) => s.memberId === m.id && s.day >= start && s.day <= end).length,
  }))
  const kindest = [...stampsThisWeek].sort((a, b) => b.given - a.given)[0]

  return (
    <div className="recap" role="dialog" aria-label={`Week of ${dayRange(start, end)}`}>
      <div className="recap__sheet">
        <header className="recap__head">
          <div>
            <p className="label">Sunday Night</p>
            <h2 className="recap__title">Week of {dayRange(start, end)}</h2>
          </div>
          <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
            <Icon name="plus" size={16} strokeWidth="2.2" />
          </button>
        </header>

        {reel.length > 0 && (
          <div className="recap__reel">
            <button
              type="button"
              className="recap__frame"
              onClick={() => setFrame((f) => (f + 1) % reel.length)}
              onPointerDown={() => setHeld(true)}
              onPointerUp={() => setHeld(false)}
              onPointerLeave={() => setHeld(false)}
              aria-label="Next photo"
            >
              <ProofImage
                path={reel[frame].path}
                w={reel[frame].w}
                h={reel[frame].h}
                alt={`${reel[frame].label}, ${dayLabel(reel[frame].day)}`}
                proofUrl={proofUrl}
                className="proof--big"
              />
            </button>
            <p className="recap__caption label">
              {reel[frame].label} · {dayLabel(reel[frame].day)} ·{' '}
              {members.find((m) => m.id === reel[frame].memberId)?.name ?? 'Someone'}
            </p>
            {reel.length > 1 && (
              <ol className="recap__dots" aria-hidden="true">
                {reel.map((shot, i) => (
                  <li key={shot.path} className={i === frame ? 'on' : ''} />
                ))}
              </ol>
            )}
          </div>
        )}

        <Progress history={days} members={members} goalDates={goalDates} fixed="week" />

        <div className="recap__stats">
          {members.map((member) => {
            const mine = score.members?.[member.id]
            return (
              <p key={member.id}>
                <strong>{Math.round((mine?.score ?? 0) * 100)}%</strong>
                <span className="label">
                  {member.name} · {(mine?.points ?? 0).toLocaleString()} of{' '}
                  {(mine?.target ?? 0).toLocaleString()} usual
                </span>
              </p>
            )
          })}
          <p>
            <strong>{cleared}</strong>
            <span className="label">full lists cleared</span>
          </p>
          <p>
            <strong>{reel.length}</strong>
            <span className="label">photos taken</span>
          </p>
          {bestDay && (
            <p>
              <strong>{dayLabel(bestDay.day)}</strong>
              <span className="label">best day</span>
            </p>
          )}
          {kindest?.given > 0 && (
            <p>
              <strong>{kindest.name}</strong>
              <span className="label">{kindest.given} stamps given</span>
            </p>
          )}
        </div>

        {score.team?.clear && (
          <p className="banner">
            <Icon name="flag" size={18} strokeWidth="1.9" />
            Team clear — {week.stake_team ?? 'something you only do together'}.
            It's in your coupons.
          </p>
        )}

        <div className={`recap__stake ${revealed ? 'recap__stake--up' : ''}`}>
          {revealed ? (
            <>
              <span className="recap__art" aria-hidden="true">
                <Icon name={winner ? 'trophy' : 'heart'} size={28} strokeWidth="1.9" />
              </span>
              <p className="label">{winner ? 'Winner takes' : 'Dead heat'}</p>
              <p className="recap__prize">
                {winner
                  ? `${winner.name} claims ${prize ?? 'the pick'}`
                  : 'Too close to call. You both get to feel smug.'}
              </p>
              {winner && (
                <p className="recap__note label">
                  It's waiting in the coupons, whenever you want to cash it.
                </p>
              )}
            </>
          ) : (
            <>
              <span className="recap__art recap__art--down" aria-hidden="true">
                <Icon name="lock" size={28} strokeWidth="1.9" />
              </span>
              <p className="label">Face down</p>
              <p className="recap__prize">
                Waiting for {waitingOn?.name ?? 'the other one'} to open theirs.
              </p>
              <p className="recap__note label">
                It flips on its own tomorrow if they don't get to it.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
