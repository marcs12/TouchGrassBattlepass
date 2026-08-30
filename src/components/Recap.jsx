import { useEffect, useMemo, useRef, useState } from 'react'
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
  loadWeek,
  onOpened,
  onClose,
}) {
  const start = week.start_day
  const end = shiftDay(start, 6)
  const still = quiet()
  const [frame, setFrame] = useState(0)
  const [held, setHeld] = useState(false)

  // The board only holds the last few weeks of days, so a Sunday further back
  // than that arrives here with an empty chart and an empty reel. Those weeks
  // go and fetch themselves rather than every launch reading a wider window.
  const inWindow = history.length > 0 && start >= history[0].day
  const [fetched, setFetched] = useState(null)
  // A fetch that came back with nothing - offline, or a query that failed. The
  // week still opens; it just cannot draw itself.
  const [missed, setMissed] = useState(false)
  const asked = useRef(null)

  // Guarded by the week it asked for rather than by the effect's own lifetime:
  // `loadWeek` changes identity whenever the board does, and marking the recap
  // opened changes the board, so a cleanup-based guard would cancel the very
  // fetch this just started.
  useEffect(() => {
    if (inWindow || !loadWeek || asked.current === start) return
    asked.current = start
    setFetched(null)
    setMissed(false)
    loadWeek(start).then((data) => {
      if (asked.current !== start) return
      if (data) setFetched(data)
      else setMissed(true)
    })
  }, [inWindow, start, loadWeek])

  const days = useMemo(
    () => fetched?.history ?? history.filter((row) => row.day >= start && row.day <= end),
    [fetched, history, start, end]
  )
  const reel = useMemo(
    () => fetched?.proofs ?? proofs.filter((p) => p.day >= start && p.day <= end),
    [fetched, proofs, start, end]
  )
  const marks = fetched?.goalDates ?? goalDates
  const stampRows = fetched?.stamps ?? stamps
  const loading = !inWindow && !fetched && !missed && Boolean(loadWeek)

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
    members.some((m) => (marks?.[m.id] ?? []).includes(d.day))
  ).length

  const stampsThisWeek = members.map((m) => ({
    ...m,
    given: stampRows.filter((s) => s.memberId === m.id && s.day >= start && s.day <= end)
      .length,
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

        {loading ? (
          <p className="empty">Fetching that week…</p>
        ) : missed ? (
          <p className="empty">That week is further back than this device holds — its chart needs a connection.</p>
        ) : (
          <Progress history={days} members={members} goalDates={marks} fixed="week" />
        )}

        <div className="recap__stats">
          {members.map((member) => {
            const mine = score.members?.[member.id]
            return (
              <p key={member.id}>
                <strong>{(mine?.points ?? 0).toLocaleString()}</strong>
                <span className="label">
                  {member.name} · {Math.round((mine?.score ?? 0) * 100)}% of a good
                  week
                </span>
              </p>
            )
          })}
          <p>
            <strong>{cleared}</strong>
            <span className="label">days that counted</span>
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
