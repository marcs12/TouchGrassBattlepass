import { useState } from 'react'
import Icon from './Icon'
import ProofCard from './ProofCard'
import ProofImage from './ProofImage'

const initial = (name) => name.trim().charAt(0).toUpperCase()

const when = (at) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })

/**
 * Running record of who banked what. Undoing a habit shows up as a negative
 * entry rather than quietly disappearing.
 *
 * It is also where you see the other one's week: their photo, and a stamp you
 * can put on it. A stamp is worth no points at all - the whole economy is
 * derived from check-offs, and a second source of points would need a rewrite
 * to earn nothing but inflation. It is worth being seen.
 */
export default function ContributionLog({
  log,
  habits = [],
  members,
  activeId,
  proofUrl,
  onCosign,
  onUncosign,
}) {
  const [open, setOpen] = useState(null)
  const memberFor = (id) => members.find((m) => m.id === id)
  // Re-read from the live log so a stamp made inside the card updates it.
  const opened = open ? log.find((e) => e.id === open) : null

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
          const theirs = entry.memberId !== activeId
          const stamps = entry.cosigns ?? []
          const mine = stamps.some((s) => s.memberId === activeId)

          return (
            <li key={entry.id} className="log__row">
              <span className="profile__avatar" aria-hidden="true">
                {member ? initial(member.name) : '?'}
              </span>

              {entry.proof && (
                <button
                  type="button"
                  className="log__proof"
                  aria-label={`See the proof for ${entry.label}`}
                  onClick={() => setOpen(entry.id)}
                >
                  <ProofImage
                    path={entry.proof.path}
                    w={entry.proof.w}
                    h={entry.proof.h}
                    alt={`${entry.label}, by ${member?.name ?? 'someone'}`}
                    proofUrl={proofUrl}
                    className="proof--thumb"
                  />
                </button>
              )}

              <span className="log__meta">
                <strong>{member?.name ?? 'Someone'}</strong>
                <span className="log__label">{entry.label}</span>
              </span>

              {/* You can't stamp your own, and an undo isn't worth applauding. */}
              {theirs && entry.points > 0 && onCosign && (
                <button
                  type="button"
                  className={`log__stamp ${mine ? 'log__stamp--on' : ''}`}
                  aria-pressed={mine}
                  aria-label={mine ? `Take back your stamp` : `Stamp ${entry.label}`}
                  onClick={() => (mine ? onUncosign(entry.id) : onCosign(entry.id))}
                >
                  <Icon name="stamp" size={15} strokeWidth="1.9" />
                  {stamps.length > 1 && <span>{stamps.length}</span>}
                </button>
              )}
              {!theirs && stamps.length > 0 && (
                <span className="log__stamp log__stamp--seen" title="Stamped by your partner">
                  <Icon name="stamp" size={15} strokeWidth="1.9" />
                </span>
              )}

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

      {opened?.proof && (
        <ProofCard
          entry={opened}
          habit={habits.find((h) => h.id === opened.habitId)}
          member={memberFor(opened.memberId)}
          activeId={activeId}
          proofUrl={proofUrl}
          onCosign={onCosign}
          onUncosign={onUncosign}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
