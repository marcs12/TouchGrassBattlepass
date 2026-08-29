import { useState } from 'react'
import { getDayOffset, setDayOffset, today } from '../lib/day'
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

  const travel = (days) => {
    const next = offset + days
    setOffset(next)
    setDayOffset(next)
    location.reload()
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
          <Row label="Season XP">{game.season?.xp?.toLocaleString()}</Row>
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
            <button type="button" className="dev__btn" onClick={() => dev.grant?.(500)}>
              +500
            </button>
            <button type="button" className="dev__btn" onClick={() => dev.grant?.(2500)}>
              +2,500
            </button>
            <button type="button" className="dev__btn" onClick={() => dev.completeDaily?.()}>
              clear daily list
            </button>
          </div>
          <p className="dev__hint">
            Grants land as habit checks, so they move the bank and season XP
            together.
          </p>
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
              ? 'Wipes points, receipts and tier claims for both players, back to a fresh bank.'
              : 'Wipes points, receipts and tier claims back to a fresh bank.'}
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
