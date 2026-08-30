import { useState } from 'react'
import { getDayOffset, setDayOffset, shiftDay, today } from '../lib/day'
import { weekStart } from '../data/week'
import Icon from './Icon'

const Row = ({ label, children }) => (
  <p className="dev__row">
    <span className="label">{label}</span>
    <span className="dev__value">{children}</span>
  </p>
)

/**
 * Hidden testing surface. Everything here writes through the normal data path,
 * so a seeded day syncs to the other device exactly like a real check-off.
 */
export default function DevPanel({ game, onClose }) {
  const [offset, setOffset] = useState(getDayOffset())
  const [open, setOpen] = useState(true)
  // Wiping the board hits both players in synced mode, so it asks twice.
  const [armed, setArmed] = useState(false)
  const [wipeNote, setWipeNote] = useState(null)
  const [thinNote, setThinNote] = useState(null)
  const dev = game.dev ?? {}

  const clearPoints = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    const result = await dev.clearPoints?.()
    if (!result) return
    setWipeNote(
      result.kept?.length
        ? `Cleared ${result.cleared.join(', ') || 'nothing'}. Kept ${result.kept.join(
            ', '
          )} - run supabase/dev-reset.sql to allow those too.`
        : `Cleared ${result.cleared.join(', ')}.`
    )
  }

  const thin = async () => {
    const result = await dev.thinProofs?.()
    setThinNote(
      result?.removed
        ? `Let go of ${result.removed} old photo${result.removed > 1 ? 's' : ''}.`
        : 'Nothing old enough to thin.'
    )
  }

  const travel = (days) => {
    const next = offset + days
    setOffset(next)
    setDayOffset(next)
    location.reload()
  }

  // Lands on the Monday after the coming recap, so the week is closed *and*
  // past the 8pm gate whatever the real clock says. Landing on the Sunday
  // itself would only work after 8pm.
  const pastRecap = () => {
    const from = today()
    const target = shiftDay(weekStart(from), 8)
    travel(Math.round((new Date(target) - new Date(from)) / 86400000))
  }

  const resetTime = () => {
    setOffset(0)
    setDayOffset(0)
    location.reload()
  }

  if (!open) {
    return (
      <button type="button" className="dev__fab" onClick={() => setOpen(true)}>
        <Icon name="target" size={16} strokeWidth="2" />
        dev
      </button>
    )
  }

  return (
    <aside className="dev" aria-label="Developer tools">
      <header className="dev__bar">
        <span className="win__title label">developer</span>
        <div className="dev__bar-actions">
          <button type="button" className="dev__mini" onClick={() => setOpen(false)}>
            hide
          </button>
          <button type="button" className="dev__mini" onClick={onClose}>
            off
          </button>
        </div>
      </header>

      <div className="dev__body">
        <section className="dev__group">
          <Row label="Mode">{game.mode}</Row>
          <Row label="Today">{today()}</Row>
          {offset !== 0 && <Row label="Offset">{offset > 0 ? `+${offset}` : offset} days</Row>}
          <Row label="Bank">{game.balance?.toLocaleString()}</Row>
          <Row label="Season">
            {game.season?.n ?? 1} · {game.season?.xp?.toLocaleString()} XP
          </Row>
          {game.code && <Row label="Code">{game.code}</Row>}
          <Row label="Playing as">
            {game.members?.find((m) => m.id === game.activeId)?.name ?? '—'}
          </Row>
          {game.error && <Row label="Error">{game.error}</Row>}
        </section>

        <section className="dev__group">
          <p className="label">Time travel</p>
          <div className="dev__buttons">
            <button type="button" className="dev__btn" onClick={() => travel(-1)}>
              −1 day
            </button>
            <button type="button" className="dev__btn" onClick={() => travel(1)}>
              +1 day
            </button>
            <button type="button" className="dev__btn" onClick={() => travel(7)}>
              +1 week
            </button>
            <button type="button" className="dev__btn" onClick={resetTime}>
              now
            </button>
          </div>
          <p className="dev__hint">
            Shifts what the app calls today, so daily resets and streaks are
            testable without waiting. Reloads on change.
          </p>
        </section>

        <section className="dev__group">
          <p className="label">Points</p>
          <div className="dev__buttons">
            {[10, 20, 30, 100, 500, 2500].map((n) => (
              <button
                key={n}
                type="button"
                className="dev__btn"
                onClick={() => dev.grant?.(n)}
              >
                +{n.toLocaleString()}
              </button>
            ))}
          </div>
          <div className="dev__buttons">
            {[10, 20, 30, 100].map((n) => (
              <button
                key={n}
                type="button"
                className="dev__btn"
                onClick={() => dev.grant?.(-n)}
              >
                −{n}
              </button>
            ))}
            <button type="button" className="dev__btn" onClick={() => dev.completeDaily?.()}>
              clear daily list
            </button>
          </div>
          <p className="dev__hint">
            Grants land as habit checks, so they move the bank and season XP
            together. Taking points back can't push the bank below zero.
          </p>
        </section>

        <section className="dev__group">
          <p className="label">Week</p>
          <Row label="Week of">{weekStart(today())}</Row>
          <div className="dev__buttons">
            <button type="button" className="dev__btn" onClick={pastRecap}>
              jump past the recap
            </button>
            <button
              type="button"
              className="dev__btn"
              onClick={() => dev.settleWeek?.(shiftDay(weekStart(today()), -7))}
            >
              settle last week
            </button>
          </div>
          <p className="dev__hint">
            A week runs Sunday to Saturday and its recap is due the Sunday
            after. Jumping past it closes the week and the recap opens itself
            on the reload. Settling scores it on the spot instead - the server
            still refuses a week that hasn't ended.
          </p>
        </section>

        <section className="dev__group">
          <p className="label">Season</p>
          <div className="dev__buttons">
            <button type="button" className="dev__btn" onClick={() => dev.endSeason?.()}>
              end season
            </button>
            <button type="button" className="dev__btn" onClick={thin}>
              thin old photos
            </button>
          </div>
          <p className="dev__hint">
            Ending rolls the track over without waiting for all twelve tiers -
            the bank, the coupons and the Sundays carry across, and the claims
            reset. Thinning drops all but the newest few photos of any week
            older than eight, which is what runs by itself on launch.
          </p>
          {thinNote && <p className="dev__hint">{thinNote}</p>}
        </section>

        <section className="dev__group">
          <p className="label">Data</p>
          <div className="dev__buttons">
            <button type="button" className="dev__btn" onClick={() => dev.seedHistory?.(6)}>
              seed 6-day streak
            </button>
            <button type="button" className="dev__btn" onClick={() => dev.clearToday?.()}>
              clear today
            </button>
            {dev.refresh && (
              <button type="button" className="dev__btn" onClick={() => dev.refresh()}>
                refetch
              </button>
            )}
          </div>
        </section>

        <section className="dev__group">
          <p className="label">Reset</p>
          <div className="dev__buttons">
            <button
              type="button"
              className={`dev__btn ${armed ? 'dev__btn--danger' : ''}`}
              onClick={clearPoints}
            >
              {armed ? 'tap again to wipe' : 'clear all points'}
            </button>
            {armed && (
              <button type="button" className="dev__btn" onClick={() => setArmed(false)}>
                cancel
              </button>
            )}
          </div>
          <p className="dev__hint">
            {game.mode === 'cloud'
              ? 'Wipes points, receipts, tier claims, weeks, stamps and seasons for both players, back to a fresh bank.'
              : 'Wipes points, receipts, tier claims, weeks, stamps and seasons back to a fresh bank.'}
          </p>
          {wipeNote && <p className="dev__hint">{wipeNote}</p>}
        </section>

        <section className="dev__group">
          <p className="label">Danger</p>
          <div className="dev__buttons">
            <button type="button" className="dev__btn dev__btn--danger" onClick={() => dev.forget?.()}>
              {game.mode === 'cloud' ? 'leave board on this device' : 'wipe local board'}
            </button>
          </div>
          <p className="dev__hint">
            {game.mode === 'cloud'
              ? 'Signs this device out and returns it to setup. Shared data is untouched, so you can rejoin with the code.'
              : 'Clears this browser only.'}
          </p>
        </section>
      </div>
    </aside>
  )
}
